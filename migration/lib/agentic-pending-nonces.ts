/**
 * Agentic 承認用 nonce の DB 登録・クレーム・失敗時の解放
 *
 * Supabase RLS: auth.uid() = user_id の行のみ操作可能。
 */

import { createServerActionClient } from '@/lib/supabase/server';

export async function registerAgenticPendingNonce(
  userId: string,
  nonce: string,
  expiresAtMs: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerActionClient();
  const expires_at = new Date(expiresAtMs).toISOString();

  const { error } = await supabase.from('agentic_pending_nonces').insert({
    user_id:    userId,
    nonce,
    expires_at,
  });

  if (error) {
    // 同一 nonce の再登録（リトライ・二重送信）は成功扱い
    if (error.code === '23505') {
      return { ok: true };
    }
    console.error('[agentic-pending-nonces] insert failed:', error.code, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * 承認実行の直前に呼ぶ。成功した行の id を返す（失敗時はリプレイ・期限切れ・不正）。
 */
export async function claimAgenticPendingNonce(
  userId: string,
  nonce: string,
): Promise<{ ok: boolean; rowId?: string }> {
  const supabase = await createServerActionClient();
  const nowIso     = new Date().toISOString();

  const { data, error } = await supabase
    .from('agentic_pending_nonces')
    .update({ consumed_at: nowIso })
    .eq('user_id', userId)
    .eq('nonce', nonce)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[agentic-pending-nonces] claim failed:', error.code, error.message);
    return { ok: false };
  }
  if (!data?.id) {
    return { ok: false };
  }
  return { ok: true, rowId: data.id };
}

/** DB 登録などが失敗したあと、同じ承認を再試行できるよう consumed を戻す */
export async function releaseAgenticPendingNonce(
  userId: string,
  rowId: string,
): Promise<void> {
  const supabase = await createServerActionClient();
  const { error } = await supabase
    .from('agentic_pending_nonces')
    .update({ consumed_at: null })
    .eq('id', rowId)
    .eq('user_id', userId);

  if (error) {
    console.error('[agentic-pending-nonces] release failed:', error.code, error.message);
  }
}
