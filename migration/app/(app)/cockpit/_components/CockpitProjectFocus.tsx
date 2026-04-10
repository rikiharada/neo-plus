/**
 * Cockpit right column — active projects (Deep Focus cards, six tag colors, neo-float-12).
 */

'use client';

import type { ProjectRow } from '@/lib/supabase/types';

function tagToneIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h + seed.charCodeAt(i)) % 6;
  }
  return h;
}

function formatYen(n: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style:    'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
}

export function CockpitProjectFocus({ projects }: { projects: ProjectRow[] }) {
  const active = projects.filter((p) => p.status === 'active');

  return (
    <section
      className="cockpit-project-focus"
      aria-labelledby="cockpit-project-focus-heading"
    >
      <div className="cockpit-project-focus__header">
        <h2 id="cockpit-project-focus-heading" className="cockpit-project-focus__title">
          進行中のプロジェクト
        </h2>
      </div>
      {active.length === 0 ? (
        <p className="cockpit-project-focus__empty">
          進行中のプロジェクトはまだありません。チャットや記録から始められます。
        </p>
      ) : (
        <ul className="cockpit-project-focus__list">
          {active.map((p) => {
            const tone = tagToneIndex(p.category || p.name || '—');
            return (
              <li key={p.id}>
                <article
                  className="cockpit-project-card cockpit-project-card--deep neo-float-12"
                >
                  <div className="cockpit-project-card__head">
                    <span
                      className={`cockpit-project-tag cockpit-project-tag--${tone}`}
                    >
                      {p.category || '未分類'}
                    </span>
                    <span className="cockpit-project-card__status">進行中</span>
                  </div>
                  <h3 className="cockpit-project-card__name">{p.name}</h3>
                  <dl className="cockpit-project-card__stats">
                    <div>
                      <dt>売上</dt>
                      <dd>{formatYen(p.revenue)}</dd>
                    </div>
                    {p.client_name ? (
                      <div>
                        <dt>クライアント</dt>
                        <dd>{p.client_name}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
