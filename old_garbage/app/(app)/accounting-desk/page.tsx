/**
 * app/(app)/accounting-desk/page.tsx
 * Ledger Desk ページ — Server Component
 *
 * ⚠️ 落とし穴:
 *   1. LedgerDeskClient は 'use client' — JSON シリアライズ可能な props のみ渡す
 *   2. hasDriveLinked は user_integrations テーブルを RLS 越しに取得
 *      （count: 'exact', head: true で行数のみ取得し、データ転送量を最小化）
 *   3. Drive 未連携でもデスクは使える（analyze のみ、upload スキップ）
 *
 * ─── 認証フロー ──────────────────────────────────────────────────
 *   requireAuth() → throws UNAUTHORIZED (401) → middleware がログインへリダイレクト
 */

import type { Metadata }  from 'next';
import { requireAuth, createServerComponentClient } from '@/lib/supabase/server';
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
  // ① 認証チェック（失敗時は 401 → middleware がリダイレクト）
  const user = await requireAuth();
  const supabase = await createServerComponentClient();

  // ② Google Drive 連携状態を確認
  //    データは不要なので head: true で件数のみ取得（RLS で user_id フィルタ済み）
  const { count: driveCount } = await supabase
    .from('user_integrations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('provider', 'google_drive');

  const hasDriveLinked = (driveCount ?? 0) > 0;

  // ─── レンダリング ───────────────────────────────────────────────

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
