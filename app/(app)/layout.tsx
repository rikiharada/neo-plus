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
import '../globals.css';
import { createServerComponentClient } from '@/lib/supabase/server';
import { AppSidebar }                  from '@/components/AppSidebar';
import { AppHeader }                   from '@/components/AppHeader';

// ─── メタデータ（子ページで上書き可能） ──────────────────────────

export const metadata: Metadata = {
  title:       'Neo+',
  description: 'フリーランスの経理を自律的にサポートするAIエージェント',
};

// ─── レイアウトコンポーネント ────────────────────────────────────

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server Component でユーザー情報を取得（Middleware が保証しているため null チェック省略可）
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="app-layout">
      {/* ─ サイドバー（狭い画面では上に回る — globals.css） ─ */}
      <AppSidebar user={user} />

      {/* ─ メインコンテンツ ─ */}
      <div className="app-main">
        <AppHeader user={user} />

        {/*
         * main の余白は globals.css の .app-content のみ（pt-16 等は付けない）。
         * AppHeader は sticky（ドキュメントフロー内）— main にヘッダー高さの二重 padding は付けない。
         */}
        <main className="app-content" id="main-content">
          {/*
           * ⚠️ PPR (Partial Prerendering):
           *   各ページが `experimental_ppr = true` を export すると
           *   静的シェルと動的コンテンツが分離される。
           *   Suspense boundary がその境界になる。
           */}
          {/* Suspense removed for hydration debug */}
          {children}
        </main>
      </div>
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
