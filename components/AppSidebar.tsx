/**
 * 認証済みレイアウト用の最小サイドバー（ナビ + 下部フィードバック）
 */

import type { User } from '@supabase/supabase-js';
import Link           from 'next/link';
import { AppNavLinks } from './AppNavLinks';
import { SidebarFeedback } from './SidebarFeedback';

export function AppSidebar({ user }: { user: User | null }) {
  return (
    <aside className="app-sidebar">
      <p className="app-sidebar__email">{user?.email ?? '—'}</p>
      <AppNavLinks />
      <p className="app-sidebar__home">
        <Link href="/cockpit">ホームへ</Link>
      </p>
      <div className="app-sidebar__spacer" aria-hidden />
      <SidebarFeedback />
    </aside>
  );
}
