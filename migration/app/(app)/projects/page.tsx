/**
 * /projects — 全案件一覧（コックピットと同系の Deep Focus カード）
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchProjects } from '@/features/projects/actions';
import {
  formatProjectYen,
  hrefForProjectDetail,
  projectTagToneIndex,
} from '@/lib/project-display-utils';
import type { ProjectRow } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'Project | Neo+',
};

export const dynamic = 'force-dynamic';

export default async function ProjectsIndexPage() {
  const projects = await fetchProjects();

  return (
    <div className="neo-home-dashboard cockpit-page projects-page">
      <header className="projects-page-header">
        <h1 className="cockpit-title">Project</h1>
        <p className="neo-home-lead projects-page-lead">
          すべての案件フォルダです。カードを開くと経費・売上と書類作成へ進めます。
        </p>
        <Link href="/cockpit" className="projects-page-back">
          ← ホームに戻る
        </Link>
      </header>

      {projects.length === 0 ? (
        <p className="cockpit-project-focus__empty" style={{ marginTop: 16 }}>
          まだプロジェクトがありません。ホームの「すばやく記録」やチャットから作成できます。
        </p>
      ) : (
        <ul className="projects-index-list">
          {projects.map((p: ProjectRow) => {
            const tone = projectTagToneIndex(p.category || p.name || '—');
            const statusJa =
              p.status === 'active'
                ? '進行中'
                : p.status === 'completed'
                  ? '完了'
                  : 'アーカイブ';
            const detailHref = hrefForProjectDetail(p.id);
            return (
              <li key={p.id}>
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
                      <span className="cockpit-project-card__status">{statusJa}</span>
                    </div>
                    <h2 className="cockpit-project-card__name">{p.name}</h2>
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
                      {p.location ? (
                        <div>
                          <dt>場所</dt>
                          <dd>{p.location}</dd>
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
    </div>
  );
}
