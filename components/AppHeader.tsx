/**
 * 認証済みレイアウト用の最小ヘッダー
 */

import Link           from 'next/link';
import type { User }  from '@supabase/supabase-js';
import { APP_HOME_HREF } from '@/components/app-nav-config';
import { ThemeToggle } from '@/components/providers/ThemeProvider';

export function AppHeader({ user }: { user: User | null }) {
  return (
    <header className="app-header">
      <Link className="app-header__brand" href={APP_HOME_HREF}>
        Neo+
      </Link>
      {user?.user_metadata?.full_name != null && (
        <span className="app-header__name">
          {String(user.user_metadata.full_name)}
        </span>
      )}
      <ThemeToggle />
    </header>
  );
}
