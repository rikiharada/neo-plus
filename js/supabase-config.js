// Supabase Initialization
// 既定はホストされたプロジェクト。Docker で supabase db reset した DB を使う場合は
// コンソールで anon key 付きで上書き: localStorage.setItem('neo_dev_supabase_url','http://127.0.0.1:54321'); localStorage.setItem('neo_dev_supabase_anon_key','<supabase status の anon key>'); location.reload();

const DEFAULT_SUPABASE_URL = 'https://nvnwnefqdsaecczpemkc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl'; // Public Anon Key

function resolveSupabaseEndpoint() {
    try {
        const ou = localStorage.getItem('neo_dev_supabase_url');
        const ok = localStorage.getItem('neo_dev_supabase_anon_key');
        if (ou && ok) {
            console.warn('[Neo] Supabase: neo_dev_* により接続先を上書きしています（開発用）。本番データではありません。', ou);
            return { supabaseUrl: ou.trim(), supabaseKey: ok.trim() };
        }
    } catch {
        /* ignore */
    }
    return { supabaseUrl: DEFAULT_SUPABASE_URL, supabaseKey: DEFAULT_SUPABASE_KEY };
}

const { supabaseUrl, supabaseKey } = resolveSupabaseEndpoint();
try {
    console.log('[Neo] Supabase 接続先:', new URL(supabaseUrl).hostname, '— docker volume / db reset はこのホストにだけ効きます。');
} catch {
    console.log('[Neo] Supabase URL:', supabaseUrl);
}

window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
window.neoSupabaseUrl = supabaseUrl;

console.log('✅ Supabase Client Initialized v2');
