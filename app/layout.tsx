/**
 * app/layout.tsx — Root Layout
 *
 * ルールと理由:
 *   1. globals.css はここで 1 回だけ import（二重ロード禁止）
 *   2. <html suppressHydrationWarning> — ThemeProvider が mount 後に
 *      html.dark クラスを付け外しするため、ハイドレーションミスマッチを許容
 *   3. <body suppressHydrationWarning> — ThemeProvider の children は
 *      サーバーとクライアントで一致するが、念のため付ける（ベストプラクティス）
 *   4. DARK_MODE_SCRIPT — React ハイドレーション前に実行される同期スクリプト。
 *      これがないと「サーバーはライト、クライアントはダーク」の一瞬の白フラッシュ
 *      と hydration mismatch 警告が出る（useLayoutEffect だけでは防げない）
 */

import './globals.css';

import type { Metadata }  from 'next';
import { ThemeProvider }  from '@/components/providers/ThemeProvider';

export const metadata: Metadata = {
  title:       'Neo+',
  description: 'フリーランスの経理を自律的にサポートするAIエージェント',
};

/**
 * ダークモード即時適用スクリプト（minified）
 * localStorage の 'neo-theme' を読み、'dark' なら <html> に .dark クラスを付ける。
 * React が DOM を触る前に同期実行されるため FOUC がゼロになる。
 */
const DARK_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('neo-theme'),d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/*
          dangerouslySetInnerHTML でインライン script を注入。
          次の理由で <Script strategy="beforeInteractive"> より確実:
          - Next.js の Script コンポーネントは hydration 後に実行されることがある
          - この script は DOMContentLoaded より前に実行される必要がある
        */}
        <script dangerouslySetInnerHTML={{ __html: DARK_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
