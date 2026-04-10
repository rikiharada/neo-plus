/**
 * app/(app)/layout.tsx
 * 認証済みユーザー向けレイアウト（サイドバー + ヘッダー + メイン）
 *
 * Server Component — 'use client' 禁止。
 *
 * ⚠️ 設計上の注意:
 *   1. try { return (...) } catch { throw } パターンは使わない
 *      → React の Suspense / Error Boundary と干渉する
 *      → redirect() は Error を throw して伝播するが、catch で二重 throw すると
 *        NEXT_REDIRECT の digest が失われることがある
 *
 *   2. supabase.auth.getUser() は JWT を Supabase サーバーで検証（安全）
 *      getSession() は Cookie をそのまま信頼するので使わない
 *
 *   3. user が null でも layout 自体はクラッシュしない。
 *      未認証の場合は各 page.tsx の requireAuth() が redirect('/login') する。
 *      layout でリダイレクトしてしまうと、公開ページを同 (app) グループに追加した
 *      ときに全部弾かれる（拡張性が下がる）。
 */

import type { Metadata }  from 'next';
import { AppSidebar }     from '@/components/AppSidebar';
import { AppHeader }      from '@/components/AppHeader';
import { AppProviders }   from '@/components/providers/AppProviders';
import { createServerComponentClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title:       'Neo+',
  description: 'フリーランスの経理を自律的にサポートするAIエージェント',
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppProviders user={user}>
      <div className="app-layout">
        <AppSidebar user={user} />
        <div className="app-main">
          <AppHeader user={user} />
          <main className="app-content" id="main-content">
            {children}
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
