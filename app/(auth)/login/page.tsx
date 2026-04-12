/**
 * app/(auth)/login/page.tsx
 * ログイン / サインアップページ（Server Component + Client フォーム）
 *
 * ⚠️ 落とし穴:
 *   1. このページ自体は Server Component にできる（フォームは Client Component に切り出す）
 *   2. 認証済みユーザーはホーム（/）へ進む想定
 *      ここでは認証チェック不要
 *   3. searchParams は Server Component で受け取れる（Pages Router の getServerSideProps 不要）
 */

import type { Metadata }    from 'next';
import { AuthForm }         from './_components/AuthForm';

// ─── メタデータ ─────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       'ログイン | Neo+',
  description: 'Neo+ にログインして、フリーランスの経理を自動化しましょう。',
};

// ─── ページコンポーネント ────────────────────────────────────────

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Next.js 15: searchParams は Promise
  const { redirectTo } = await searchParams;

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* ─ ロゴ ─ */}
        <div className="auth-logo" aria-label="Neo+ ロゴ">
          <span className="auth-logo-text">Neo+</span>
          <span className="auth-logo-sub">フリーランス会計エージェント</span>
        </div>

        {/* ─ フォーム（Client Component） ─ */}
        <AuthForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
