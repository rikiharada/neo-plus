import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://nvnwnefqdsaecczpemkc.supabase.co';
const supabaseKey = 'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl'; // Public Anon Key

export const supabase = createClient(supabaseUrl, supabaseKey);

// Maintain backwards compatibility for the current "master" files
window.supabaseClient = supabase;
console.log('✅ Supabase Client Initialized (ESM Core Extraction)');
