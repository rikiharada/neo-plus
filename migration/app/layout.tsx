/**
 * app/layout.tsx — Root Layout（必須）
 * html/body とグローバル CSS はここに一度だけ。
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title:       'Neo+',
  description: 'フリーランスの経理を自律的にサポートするAIエージェント',
};

function RootOutletFallback() {
  return (
    <div
      className="root-outlet-fallback"
      aria-busy="true"
      aria-label="読み込み中"
      style={{
        minHeight:       '100vh',
        display:         'grid',
        placeItems:      'center',
        color:           'var(--text-muted)',
        fontSize:        '14px',
      }}
    >
      準備中…
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Suspense fallback={<RootOutletFallback />}>{children}</Suspense>
      </body>
    </html>
  );
}
