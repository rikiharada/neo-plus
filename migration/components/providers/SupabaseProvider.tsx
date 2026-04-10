'use client';

import { useEffect, type ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/** Warm up browser Supabase client; session follows cookies (RSC uses server client). */
export function SupabaseProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    void client.auth.getSession();
  }, []);

  return <>{children}</>;
}
