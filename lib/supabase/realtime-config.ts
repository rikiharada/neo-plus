/**
 * Supabase Realtime（realtime-js）のソケット既定タイムアウト。
 * 既定は 10s（push / join の待ち）→ TIMED_OUT が出やすい環境向けに 20s。
 *
 * @see ChatWindow.tsx — CHANNEL_ERROR / TIMED_OUT 時の指数バックオフ再接続
 * @see lib/supabase/client.ts — createBrowserClient に渡す
 */

/** Phoenix / RealtimeClient の push タイムアウト（ms）。既定 10_000 から延長 */
export const REALTIME_SOCKET_TIMEOUT_MS = 20_000;
