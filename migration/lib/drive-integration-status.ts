/**
 * lib/drive-integration-status.ts
 * Server Component / Server Action から Google Drive 連携状態を取得する
 *
 * リモート DB に user_integrations が無い環境では PostgREST がエラーを返す。
 * その場合は即 false を返し、コンソールノイズと待ちを抑える。
 */

import { createServerComponentClient } from '@/lib/supabase/server';

/** Matches `createServerComponentClient()` return type (avoids Supabase generic mismatch). */
type ServerComponentSupabase = Awaited<
  ReturnType<typeof createServerComponentClient>
>;

function isUserIntegrationsUnavailable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? '';
  const code = err.code ?? '';
  if (code === 'PGRST205' || code === '42P01') return true;
  if (
    msg.includes('user_integrations') &&
    (msg.includes('schema cache') ||
      msg.includes('does not exist') ||
      msg.includes('Could not find the table'))
  ) {
    return true;
  }
  return false;
}

/**
 * @param supabase 同一リクエスト内で他クエリと並列化する場合に渡す（省略時は新規クライアント）
 */
export async function getGoogleDriveLinkedForUser(
  userId: string,
  supabase?: ServerComponentSupabase,
): Promise<boolean> {
  const client = supabase ?? (await createServerComponentClient());
  const { data, error } = await client
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .maybeSingle();

  if (error) {
    if (isUserIntegrationsUnavailable(error)) {
      return false;
    }
    console.warn('[drive-integration-status]', error.message);
    return false;
  }
  return !!data;
}
