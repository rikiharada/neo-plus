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

export const supabase = createClient(supabaseUrl, supabaseKey);

// Maintain backwards compatibility for the current "master" files
window.supabaseClient = supabase;
window.neoSupabaseUrl = supabaseUrl;
console.log('✅ Supabase Client Initialized (ESM Core Extraction)');
