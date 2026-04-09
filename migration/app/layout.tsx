/**
 * app/layout.tsx — Root Layout（必須）
 * html/body とグローバル CSS はここに一度だけ。
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'Neo+',
  description: 'フリーランスの経理を自律的にサポートするAIエージェント',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
