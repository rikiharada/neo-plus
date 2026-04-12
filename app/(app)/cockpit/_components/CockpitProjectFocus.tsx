/**
 * Cockpit right column — active projects (Deep Focus cards, six tag colors, neo-float-12).
 */

'use client';

import Link from 'next/link';
import { projectCanonicalId, type ProjectRow } from '@/lib/supabase/types';
import {
  formatProjectYen,
  hrefForProjectRow,
  projectTagToneIndex,
} from '@/lib/project-display-utils';

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
            const tone = projectTagToneIndex(p.category || p.name || '—');
            const pid = projectCanonicalId(p);
            const detailHref = hrefForProjectRow(p);
            return (
              <li key={pid}>
                <Link
                  href={detailHref}
                  className="cockpit-project-card-link"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
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
                        <dd>{formatProjectYen(p.revenue)}</dd>
                      </div>
                      {p.client_name ? (
                        <div>
                          <dt>クライアント</dt>
                          <dd>{p.client_name}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
