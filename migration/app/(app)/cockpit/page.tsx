/**
 * app/(app)/cockpit/page.tsx
 * コックピット（ダッシュボード）ページ — Server Component
 *
 * ⚠️ 落とし穴:
 *   1. 'use client' を付けると Server Component の利点（並列 fetch、RSC Payload）が失われる
 *      → インタラクティブな部分だけを Client Component に切り出す
 *   2. fetch はここで行い、結果を Client Component に props として渡す
 *      → Client Component 内で useEffect で fetch しない（ウォーターフォール回避）
 *   3. revalidatePath('/cockpit') を Server Action で呼ぶと
 *      このページが自動的に再取得される（キャッシュ無効化）
 */

import type { Metadata }               from 'next';
import { Suspense }                    from 'react';
import { requireAuth }                 from '@/lib/supabase/server';
import { getGoogleDriveLinkedForUser } from '@/lib/drive-integration-status';
import { fetchActivities }             from '@/features/activities/actions';
import { loadSoulServer }              from '@/features/soul/server';
import { ActivityFeed }                from './_components/ActivityFeed';
import { SummaryCards }                from './_components/SummaryCards';
import { QuickEntryButton }            from './_components/QuickEntryButton';
import type { CockpitSummary }         from './_components/types';
import { DriveConnectionBanner }       from './_components/DriveConnectionBanner';
import { DriveOnboardingHero }         from './_components/DriveOnboardingHero';

// ─── メタデータ ─────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'コックピット | Neo+',
};

// ─── PPR: 静的シェルと動的コンテンツを分離 ──────────────────────

// ─── ページコンポーネント ────────────────────────────────────────

export default async function CockpitPage() {
  // 認証（Middleware が保証するため通常はスキップできるが、二重保護として残す）
  const user = await requireAuth();

  const driveLinked = await getGoogleDriveLinkedForUser(user.id);

  // 並列 fetch（Promise.all でウォーターフォール回避）
  const [recentActivities, soul] = await Promise.all([
    fetchActivities({ limit: 20 }),
    loadSoulServer(user.id),
  ]);

  // 収支サマリー計算（Server 側で行い Client に渡す）
  const summary = _calcSummary(recentActivities);

  return (
    <div className="cockpit-page">
      {/* ─ ページタイトル ─ */}
      <div className="cockpit-header">
        <h1 className="cockpit-title">コックピット</h1>
        <QuickEntryButton />
      </div>

      {!driveLinked ? <DriveOnboardingHero /> : null}

      <Suspense fallback={null}>
        <DriveConnectionBanner driveLinked={driveLinked} suppressUnlinkedCta={!driveLinked} />
      </Suspense>

      {/* ─ サマリーカード ─ */}
      {/*
       * SummaryCards は静的シェルとして先にレンダリング可能。
       * data は Server から受け取るため hydration 不整合が起きない。
       */}
      <SummaryCards summary={summary} />

      {/* ─ 最新アクティビティ（サマリーより mt を広く取り、呼吸を確保） ─ */}
      <Suspense fallback={<ActivityFeedSkeleton />}>
        <section
          className="cockpit-activity-section"
          aria-labelledby="cockpit-activity-heading"
        >
          <h2 id="cockpit-activity-heading" className="cockpit-activity-heading">
            最新のアクティビティ
          </h2>
          <ActivityFeed
            activities={recentActivities}
            soul={soul}
            userId={user.id}
          />
        </section>
      </Suspense>

      <footer className="cockpit-page-footer">
        確かなマネーマネジメントを、あなたと共に。
      </footer>
    </div>
  );
}

// ─── ユーティリティ ──────────────────────────────────────────────

function _calcSummary(activities: Awaited<ReturnType<typeof fetchActivities>>): CockpitSummary {
  let totalIncome   = 0;
  let totalExpense  = 0;
  let laborExpense  = 0;

  for (const a of activities) {
    if (a.type === 'income')  totalIncome  += a.amount;
    if (a.type === 'expense') totalExpense += a.amount;
    if (a.type === 'expense' && a.category === '人件費') {
      laborExpense += a.amount;
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance:       totalIncome - totalExpense,
    activityCount: activities.length,
    laborExpense,
  };
}

// ─── スケルトン ─────────────────────────────────────────────────

function ActivityFeedSkeleton() {
  return (
    <div className="activity-feed-skeleton" aria-busy="true" aria-label="収支データを読み込み中">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="activity-skeleton-item">
          <div className="skeleton-bar skeleton-bar--icon" />
          <div className="skeleton-bar skeleton-bar--text" />
          <div className="skeleton-bar skeleton-bar--amount" />
        </div>
      ))}
    </div>
  );
}
