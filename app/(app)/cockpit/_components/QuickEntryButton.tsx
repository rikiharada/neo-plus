/**
 * コックピット — チャットへ誘導するクイック入力 CTA
 */

'use client';

import Link from 'next/link';

export function QuickEntryButton() {
  return (
    <Link href="/chat" className="cockpit-quick-entry">
      すばやく記録
    </Link>
  );
}
