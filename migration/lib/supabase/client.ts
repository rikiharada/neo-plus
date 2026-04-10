/**
 * lib/supabase/client.ts
 * @supabase/ssr — ブラウザ専用クライアント（シングルトン）
 *
 * ⚠️ このファイルは Client Components ('use client') のみで使う。
 *    Server Components では lib/supabase/server.ts を使うこと。
 *
 * GoTrueClient の重複インスタンス警告を防ぐため、モジュールレベルで
 * シングルトンとして保持する。
 */

import { createBrowserClient } from '@supabase/ssr';
import { REALTIME_SOCKET_TIMEOUT_MS } from './realtime-config';
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from './public-env';

// ─── シングルトン保持 ─────────────────────────────────────────────

let _client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * ブラウザ用 Supabase クライアント（シングルトン）。
 *
 * ⚠️ 落とし穴:
 *   - `createBrowserClient` を毎回呼ぶと GoTrueClient が重複生成される
 *   - この関数はモジュールスコープの変数でインスタンスを再利用する
 *   - SSR/RSC では呼ばないこと（サーバーでは server.ts を使う）
 *
 * @example
 * ```tsx
 * 'use client'
 * import { getSupabaseBrowserClient } from '@/lib/supabase/client'
 *
 * export function useActivities() {
 *   const supabase = getSupabaseBrowserClient();
 *   // Realtime subscription など
 * }
 * ```
 */
export const getSupabaseBrowserClient = () => {
  if (!_client) {
    _client = createBrowserClient(
      getSupabasePublicUrl(),
      getSupabasePublicAnonKey(),
      {
        realtime: {
          /** 既定 10s → 20s（TIMED_OUT 緩和）。RLS 購読は setAuth 完了後に開始（ChatWindow） */
          timeout: REALTIME_SOCKET_TIMEOUT_MS,
        },
      },
    );
  }
  return _client;
};
