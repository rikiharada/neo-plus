/**
 * Supabase ブラウザ公開用 env（URL / anon key）
 * 値が無い場合は即 throw — サイレント失敗を防ぐ
 */

let _supabaseEnvDebugLogged = false;

/** Logs once in development or when NEO_DEBUG_SUPABASE=1 (no secrets). */
function debugLogSupabaseEnvOnce(): void {
  const enabled =
    process.env.NEO_DEBUG_SUPABASE === '1' ||
    process.env.NODE_ENV === 'development';
  if (!enabled || _supabaseEnvDebugLogged) return;
  _supabaseEnvDebugLogged = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log('[supabase/public-env]', {
    NEXT_PUBLIC_SUPABASE_URL: url?.trim()
      ? `ok (${url.trim().slice(0, 32)}…)`
      : 'undefined or empty',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key?.trim()
      ? `ok (length=${key.trim().length})`
      : 'undefined or empty',
  });
}

export function getSupabasePublicUrl(): string {
  debugLogSupabaseEnvOnce();
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v || v.trim().length === 0) {
    console.error(
      '[supabase/public-env] NEXT_PUBLIC_SUPABASE_URL is missing — check .env.local',
    );
    throw new Error('Supabase env missing: NEXT_PUBLIC_SUPABASE_URL');
  }
  return v;
}

export function getSupabasePublicAnonKey(): string {
  debugLogSupabaseEnvOnce();
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v || v.trim().length === 0) {
    console.error(
      '[supabase/public-env] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing — check .env.local',
    );
    throw new Error('Supabase env missing: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return v;
}
