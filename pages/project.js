import { supabase } from '../lib/supabase-client.js';

export function initProjectView() {
    console.log("[Neo Router] Initialized Project View");
    
    // Source data securely from native Supabase GlobalStore, or fallback to mockDB
    const activeProjects = window.GlobalStore?.state?.projects || window.mockDB?.projects || [];
    window.dispatchEvent(new CustomEvent('neo-render-projects', { detail: { projects: activeProjects } }));
}
