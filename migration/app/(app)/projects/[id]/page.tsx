/**
 * /projects/[id] — Project folder detail: activities + links to documents.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { fetchActivities } from '@/features/activities/actions';
import { fetchProjectById } from '@/features/projects/actions';
import { isNextRedirectError } from '@/lib/supabase/server';
import {
  formatProjectYen,
  projectTagToneIndex,
} from '@/lib/project-display-utils';
import { isValidUuidString } from '@/lib/validation';
import { activityCanonicalId, type ActivityRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

function activityTypeLabel(t: ActivityRow['type']): string {
  if (t === 'expense') return '経費';
  if (t === 'income') return '売上';
  return '振替';
}

function activityTypeTone(t: ActivityRow['type']): number {
  if (t === 'expense') return 3;
  if (t === 'income') return 2;
  return 4;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isValidUuidString(id)) return { title: 'Project | Neo+' };
  const project = await fetchProjectById(id);
  if (!project) return { title: 'Project | Neo+' };
  return { title: `${project.name} | Neo+` };
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isValidUuidString(id)) redirect('/projects');

  let project: Awaited<ReturnType<typeof fetchProjectById>>;
  try {
    project = await fetchProjectById(id);
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    console.error('[projects/[id]/page] fetchProjectById error:', err);
    notFound();
  }
  if (!project) notFound();

  let activities: Awaited<ReturnType<typeof fetchActivities>> = [];
  try {
    activities = await fetchActivities({ projectId: id, limit: 100 });
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    console.error('[projects/[id]/page] fetchActivities error:', err);
  }
  const tone = projectTagToneIndex(project.category || project.name || '—');
  const statusJa =
    project.status === 'active'
      ? '進行中'
      : project.status === 'completed'
        ? '完了'
        : 'アーカイブ';

  return (
    <div className="neo-home-dashboard cockpit-page projects-page project-detail-page">
      <header className="project-detail-header">
        <nav className="project-detail-breadcrumb" aria-label="パンくず">
          <Link href="/projects">Project 一覧</Link>
          <span aria-hidden> / </span>
          <span>{project.name}</span>
        </nav>
        <div className="project-detail-hero cockpit-project-card cockpit-project-card--deep neo-float-12">
          <div className="cockpit-project-card__head">
            <span className={`cockpit-project-tag cockpit-project-tag--${tone}`}>
              {project.category || '未分類'}
            </span>
            <span className="cockpit-project-card__status">{statusJa}</span>
          </div>
          <h1 className="cockpit-project-card__name" style={{ fontSize: '1.35rem' }}>
            {project.name}
          </h1>
          <dl className="cockpit-project-card__stats">
            <div>
              <dt>売上（集計）</dt>
              <dd>{formatProjectYen(project.revenue)}</dd>
            </div>
            {project.client_name ? (
              <div>
                <dt>クライアント</dt>
                <dd>{project.client_name}</dd>
              </div>
            ) : null}
            {project.location ? (
              <div>
                <dt>場所</dt>
                <dd>{project.location}</dd>
              </div>
            ) : null}
          </dl>
          {project.note ? (
            <p className="project-detail-note">{project.note}</p>
          ) : null}
        </div>
      </header>

      <section className="project-detail-docs" aria-labelledby="project-docs-heading">
        <h2 id="project-docs-heading" className="project-detail-section-title">
          書類作成
        </h2>
        <p className="project-detail-section-lead">
          Ledger Desk で請求書・見積書の下書きに進みます。
        </p>
        <div className="project-detail-doc-actions">
          <Link
            href="/accounting-desk"
            className="project-detail-doc-btn neo-float-12"
          >
            請求書・見積書を作成
          </Link>
          <Link href="/cockpit" className="project-detail-doc-btn project-detail-doc-btn--ghost">
            ホームへ
          </Link>
        </div>
      </section>

      <section className="project-detail-activities" aria-labelledby="project-act-heading">
        <h2 id="project-act-heading" className="project-detail-section-title">
          この案件の収支
        </h2>
        {activities.length === 0 ? (
          <p className="cockpit-project-focus__empty">
            まだこの案件に紐づく記録がありません。
          </p>
        ) : (
          <ul className="project-activity-list">
            {activities.map((a: ActivityRow) => {
              const tt = activityTypeTone(a.type);
              return (
                <li
                  key={activityCanonicalId(a)}
                  className="project-activity-row cockpit-project-card--deep neo-float-12"
                >
                  <div className="project-activity-row__top">
                    <span
                      className={`cockpit-project-tag cockpit-project-tag--${tt}`}
                    >
                      {activityTypeLabel(a.type)}
                    </span>
                    <time dateTime={a.date} className="project-activity-date">
                      {a.date.slice(0, 10)}
                    </time>
                  </div>
                  <div className="project-activity-row__body">
                    <span className="project-activity-title">{a.title}</span>
                    <span className="project-activity-amount">
                      {formatProjectYen(a.amount)}
                    </span>
                  </div>
                  <div className="project-activity-meta">{a.category}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
