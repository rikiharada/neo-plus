/**
 * app/(app)/layout.tsx
 * 認証済みユーザー向けアプリレイアウト
 *
 * ⚠️ 落とし穴:
 *   1. ここでは認証チェックを行わない（Middleware が担当する）
 *   2. children は Suspense でラップして PPR の恩恵を受ける
 *   3. サイドバーは Server Component にすることでユーザー情報を SSR できる
 *   4. Sidebar を Client Component にすると「モバイルの開閉」も同じファイルで管理できるが
 *      ユーザー情報取得が遅れる → Server Component で data 取得 → Client Component に渡す
 */

import type { Metadata }               from 'next';
import { Suspense }                    from 'react';
import { createServerComponentClient } from '@/lib/supabase/server';
import { AppSidebar }                  from '@/components/AppSidebar';
import { AppHeader }                   from '@/components/AppHeader';

// ─── メタデータ（子ページで上書き可能） ──────────────────────────

export const metadata: Metadata = {
  title:       'Neo+',
  description: 'フリーランスの経理を自律的にサポートするAIエージェント',
};

// ─── レイアウトコンポーネント ────────────────────────────────────

async function AppShellWithUser({ children }: { children: React.ReactNode }) {
  // const supabase = await createServerComponentClient();
  // const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <AppSidebar user={null} />
      <div className="app-main">
        <AppHeader user={null} />
        <main className="app-content" id="main-content">
          {children}
        </main>
      </div>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <AppShellWithUser>{children}</AppShellWithUser>
    </div>
  );
}

// ─── スケルトン ─────────────────────────────────────────────────

function PageLoadingSkeleton() {
  return (
    <div className="page-skeleton" aria-label="ページを読み込み中" aria-busy="true">
      <div className="skeleton-bar skeleton-bar--title" />
      <div className="skeleton-bar skeleton-bar--text" />
      <div className="skeleton-bar skeleton-bar--text skeleton-bar--short" />
      <div className="skeleton-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}
