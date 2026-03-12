// Supabase Initialization
const supabaseUrl = 'https://nvnwnefqdsaecczpemkc.supabase.co';
const supabaseKey = 'sb_publishable_-HXdEPTx-rOM6rcRt5IyjQ_K33EQ-Bl'; // Public Anon Key
window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase Client Initialized v2');
