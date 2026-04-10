import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const DEFAULT_SUPABASE_URL = 'https://nvnwnefqdsaecczpemkc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl'; // Public Anon Key

function resolveSupabaseEndpoint() {
    try {
        const ou = localStorage.getItem('neo_dev_supabase_url');
        const ok = localStorage.getItem('neo_dev_supabase_anon_key');
        if (ou && ok) {
            return { supabaseUrl: ou.trim(), supabaseKey: ok.trim() };
        }
    } catch {
        /* ignore */
    }
    return { supabaseUrl: DEFAULT_SUPABASE_URL, supabaseKey: DEFAULT_SUPABASE_KEY };
}

const { supabaseUrl, supabaseKey } = resolveSupabaseEndpoint();

// supabase-config.js（classic script）が先に window.supabaseClient を生成している場合は
// 同じインスタンスを再利用して GoTrueClient の重複インスタンス警告を防ぐ
export const supabase = window.supabaseClient ?? createClient(supabaseUrl, supabaseKey);

if (!window.supabaseClient) {
    // supabase-config.js より先に評価された場合だけ登録（通常はありえないが安全策）
    window.supabaseClient = supabase;
    window.neoSupabaseUrl = supabaseUrl;
    console.log('✅ Supabase Client Initialized (ESM Core Extraction)');
} else {
    console.log('✅ Supabase Client reused from supabase-config.js (no duplicate GoTrueClient)');
}
