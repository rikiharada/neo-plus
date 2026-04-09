/**
 * NEXT_PUBLIC Supabase URL / anon key の解決。
 * Edge / Node で .env が読めない・未設定のときの切り分け用に、ルート js/supabase-config.js と同一の既定をフォールバックする。
 * 本番では .env.local（またはホストの環境変数）で必ず上書きすること。
 */
const FALLBACK_URL =
  'https://nvnwnefqdsaecczpemkc.supabase.co';
const FALLBACK_ANON_KEY =
  'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl';

export function getSupabasePublicUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  console.log('[DEBUG] NEXT_PUBLIC_SUPABASE_URL =', v);
  return v && v.length > 0 ? v : FALLBACK_URL;
}

export function getSupabasePublicAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return v && v.length > 0 ? v : FALLBACK_ANON_KEY;
}
