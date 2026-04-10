/**
 * app/(app)/accounting-desk/page.tsx
 * Ledger Desk ページ — Server Component
 *
 * ⚠️ 落とし穴:
 *   1. LedgerDeskClient は 'use client' — JSON シリアライズ可能な props のみ渡す
 *   2. hasDriveLinked は getGoogleDriveLinkedForUser（欠落テーブル時は false）
 *   3. Drive 未連携でもデスクは使える（analyze のみ、upload スキップ）
 *
 * ─── 認証フロー ──────────────────────────────────────────────────
 *   RSC では createServerComponentClient + getUser（read-only Cookie）。
 *   未認証は redirect（getUser + redirect で requireAuth と同様の UX）。
 */

import type { Metadata }  from 'next';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { getGoogleDriveLinkedForUser } from '@/lib/drive-integration-status';
import { LedgerDeskClient } from './_components/LedgerDeskClient';

// ─── メタデータ ─────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Ledger Desk | Neo+',
  description: '領収書・帳票をドロップして、Neo に解析・仕訳を依頼できます。',
};

/** Vercel / CDN で古い静的シェルが残らないよう、常に動的レンダリング */
export const dynamic = 'force-dynamic';

// ─── ページコンポーネント ────────────────────────────────────────

export default async function AccountingDeskPage() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/accounting-desk');
  }

  const hasDriveLinked = await getGoogleDriveLinkedForUser(user.id, supabase);

  // ─── レンダリング ─────────────────────────────────────────────

  return (
    <div className="accounting-desk-page">

      {/* ─ ページヘッダー ─ */}
      <header className="accounting-desk-header">
        <h1 className="accounting-desk-title">Ledger Desk</h1>
        <p className="accounting-desk-subtitle">
          領収書・CSV・帳票をドロップすると、Neo が読み取って話しかけます。
        </p>
      </header>

      {/* ─ クライアントオーケストレーター ─ */}
      <LedgerDeskClient
        userId={user.id}
        hasDriveLinked={hasDriveLinked}
      />
    </div>
  );
}
