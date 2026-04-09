/**
 * チャット画面用 Realtime（activities）— シングルトン購読・セッション検証・remove の await
 * Next.js 15 + Strict Mode でも二重 WebSocket を抑えるため、チャンネル参照をモジュールで 1 本化する。
 *
 * ─── 実機・開発での確認手順（簡易） ─────────────────────────────
 * 1. 通常: `.env.local` に `NEXT_PUBLIC_CHAT_REALTIME_DEBUG=1` を付けてチャットを開く
 *    → コンソールに購読・変更・バックオフのみ（DEBUG なしでは Realtime 系はほぼ無音）
 * 2. 比較用オフ: `NEXT_PUBLIC_CHAT_REALTIME=0` → postgres_changes なし（チャット本文はそのまま）
 * 3. RSC 負荷切り分け: `NEXT_PUBLIC_CHAT_REALTIME_RSC=0` → Realtime からの router.refresh のみ停止
 *
 * ─── フォールバック（完全オフ） ─────────────────────────────────
 * `NEXT_PUBLIC_CHAT_REALTIME=0` または `false` のとき、ChatWindow は購読しない。
 * → `isChatRealtimeDisabledFromEnv()` が単一の判定口。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** 開発時かつ NEXT_PUBLIC_CHAT_REALTIME_DEBUG=1 のときだけ chat-realtime 内で詳細ログ */
function rtDebugLog(...args: unknown[]): void {
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_CHAT_REALTIME_DEBUG === '1'
  ) {
    console.warn('[chat-realtime]', ...args);
  }
}

/**
 * Realtime を完全に切る（postgres_changes 非購読）。
 * `0` / `false` のみ true。未設定は false（購読する）。
 */
export function isChatRealtimeDisabledFromEnv(): boolean {
  const v = process.env.NEXT_PUBLIC_CHAT_REALTIME;
  return v === '0' || v === 'false';
}

/** このタブでアクティブな neo-chat-activities チャンネル（useRef と二重保持して厳密に remove） */
let neoChatActivitiesChannel: RealtimeChannel | null = null;

export function getNeoChatActivitiesChannel(): RealtimeChannel | null {
  return neoChatActivitiesChannel;
}

export function setNeoChatActivitiesChannel(ch: RealtimeChannel | null): void {
  neoChatActivitiesChannel = ch;
}

/**
 * 必ず await してから新規 channel() すること（「WebSocket is closed before…」対策）
 */
export async function removeNeoChatActivitiesChannel(
  supabase: SupabaseClient,
  channelRef: { current: RealtimeChannel | null },
): Promise<void> {
  const fromRef = channelRef.current;
  const target = fromRef ?? neoChatActivitiesChannel;
  if (!target) {
    channelRef.current = null;
    neoChatActivitiesChannel = null;
    return;
  }
  try {
    await supabase.removeChannel(target);
  } catch {
    /* 既に閉じている場合など */
  }
  if (channelRef.current === target) {
    channelRef.current = null;
  }
  if (neoChatActivitiesChannel === target) {
    neoChatActivitiesChannel = null;
  }
}

/**
 * クライアントに残った `neo-chat-activities:{userId}` 系チャンネルを掃除（Strict Mode / 異常時の残骸対策）
 */
export async function removeOrphanNeoChatActivityChannels(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const marker = `neo-chat-activities:${userId}`;
    const client = supabase as unknown as {
      getChannels?: () => RealtimeChannel[];
    };
    if (typeof client.getChannels !== 'function') {
      return;
    }
    const channels = client.getChannels();
    for (const ch of channels) {
      const topic = (ch as { topic?: string }).topic ?? '';
      if (!topic.includes(marker)) continue;
      try {
        await supabase.removeChannel(ch);
        rtDebugLog('removed orphan channel', topic.slice(0, 80));
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    rtDebugLog('removeOrphanNeoChatActivityChannels failed', e);
  }
}

/**
 * subscribe 前: セッション有効化 + Realtime JWT
 * @returns アクセストークンが取れたら true
 */
export async function ensureSessionForRealtimeSubscribe(
  supabase: SupabaseClient,
): Promise<boolean> {
  const {
    data: { session: s0 },
  } = await supabase.auth.getSession();

  if (s0?.access_token) {
    await supabase.realtime.setAuth(s0.access_token);
    return true;
  }

  const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
  if (refErr) {
    rtDebugLog('refreshSession:', refErr.message);
  }
  if (refreshed.session?.access_token) {
    await supabase.realtime.setAuth(refreshed.session.access_token);
    return true;
  }

  const {
    data: { session: s1 },
  } = await supabase.auth.getSession();
  if (s1?.access_token) {
    await supabase.realtime.setAuth(s1.access_token);
    return true;
  }

  await supabase.realtime.setAuth(null);
  return false;
}

/** CHANNEL_ERROR / TIMED_OUT 後の待機（秒）— 2 → 4 → 8 */
export const REALTIME_RECONNECT_BACKOFF_MS = [2000, 4000, 8000] as const;
