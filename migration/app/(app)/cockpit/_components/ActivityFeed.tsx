/**
 * コックピット — 最新アクティビティ一覧
 */

'use client';

import type { NeoSoul } from '@/features/soul/server';
import type { ActivityRow } from '@/lib/supabase/types';

function formatYen(n: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style:    'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('ja-JP', {
      year:  'numeric',
      month: 'short',
      day:   'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

export function ActivityFeed({
  activities,
  soul: _soul,
  userId: _userId,
}: {
  activities: ActivityRow[];
  soul:         NeoSoul;
  userId:       string;
}) {
  void _soul;
  void _userId;

  return (
    <ul className="cockpit-activity-list">
      {activities.length === 0 ? (
        <li className="cockpit-activity-empty">
          まだ記録がありません。チャットから登録してみましょう。
        </li>
      ) : (
        activities.map((a) => (
          <li key={a.id} className="cockpit-activity-item">
            <div className="cockpit-activity-item__main">
              <span className="cockpit-activity-item__title">{a.title}</span>
              <span className="cockpit-activity-item__meta">
                {formatDate(a.date)} · {a.category}
              </span>
            </div>
            <span
              className={
                'cockpit-activity-item__amount ' +
                (a.type === 'income'
                  ? 'cockpit-activity-item__amount--in'
                  : 'cockpit-activity-item__amount--out')
              }
            >
              {a.type === 'expense' ? '−' : '+'}
              {formatYen(a.amount)}
            </span>
          </li>
        ))
      )}
    </ul>
  );
}
