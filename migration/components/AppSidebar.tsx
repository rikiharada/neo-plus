/**
 * 認証済みレイアウト用の最小サイドバー（ナビ + 下部フィードバック）
 */

'use client';

import type { User } from '@supabase/supabase-js';
import { Suspense } from 'react';
import { AppNavLinks, AppNavLinksFallback } from './AppNavLinks';
import { SidebarFeedback } from './SidebarFeedback';

export function AppSidebar({ user }: { user: User | null }) {
  return (
    <aside className="app-sidebar">
      <p className="app-sidebar__email">{user?.email ?? '—'}</p>
      <Suspense fallback={<AppNavLinksFallback />}>
        <AppNavLinks />
      </Suspense>
      <div className="app-sidebar__spacer" aria-hidden />
      <SidebarFeedback />
    </aside>
  );
}
