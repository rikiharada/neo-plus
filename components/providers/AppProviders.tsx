'use client';

import type { User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { SupabaseProvider } from './SupabaseProvider';
import { UserProvider } from './UserProvider';

export function AppProviders({
  user,
  children,
}: {
  user: User | null;
  children: ReactNode;
}) {
  return (
    <UserProvider user={user}>
      <SupabaseProvider>{children}</SupabaseProvider>
    </UserProvider>
  );
}
