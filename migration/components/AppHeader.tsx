/**
 * 認証済みレイアウト用の最小ヘッダー
 */

import Link           from 'next/link';
import type { User }  from '@supabase/supabase-js';
import { ThemeToggle } from '@/components/providers/ThemeProvider';

export function AppHeader({ user }: { user: User | null }) {
  return (
    <header className="app-header">
      <Link className="app-header__brand" href="/">
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
