/**
 * app/(app)/page.tsx — ホーム（統合ダッシュボード） `/`
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  requireAuth,
  createServerComponentClient,
  isNextRedirectError,
} from '@/lib/supabase/server';
import { getGoogleDriveLinkedForUser } from '@/lib/drive-integration-status';
import { fetchActivities } from '@/features/activities/actions';
import { loadSoulServer, NEO_DEFAULT_SOUL } from '@/features/soul/server';
import Link from 'next/link';
import { DriveConnectionBanner } from './cockpit/_components/DriveConnectionBanner';
import { CockpitDesk } from './cockpit/_components/CockpitDesk';
import type { ProjectRow } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'ホーム | Neo+',
};

export const dynamic = 'force-dynamic';

type HomePageProps = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

function isNextDynamicServerError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes('Dynamic server usage')) return true;
  const d = (err as Error & { digest?: string }).digest;
  return d === 'DYNAMIC_SERVER_USAGE';
}

function HomeFallback() {
  return (
    <div className="neo-home-dashboard cockpit-page" style={{ padding: '2rem' }}>
      <h1>Hello Neo+</h1>
      <p style={{ marginTop: 12, color: 'var(--text-muted, #536471)', maxWidth: 480 }}>
        ホームの読み込みに失敗しました。設定やネットワークを確認し、しばらくしてから再度お試しください。
      </p>
    </div>
  );
}

export default async function HomePage(props: HomePageProps) {
  try {
    await props.params;

    const [user, supabase] = await Promise.all([
      requireAuth(),
      createServerComponentClient(),
    ]);

    const [driveSettled, activitiesSettled, soulSettled, projectsSettled] =
      await Promise.allSettled([
        getGoogleDriveLinkedForUser(user.id, supabase),
        fetchActivities({ limit: 20 }),
        loadSoulServer(user.id),
        (async (): Promise<ProjectRow[]> => {
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          if (error) {
            throw new Error(error.message);
          }
          return (data ?? []) as ProjectRow[];
        })(),
      ]);

    const driveLinked =
      driveSettled.status === 'fulfilled' ? driveSettled.value : false;
    if (driveSettled.status === 'rejected') {
      console.warn('[home] drive status:', driveSettled.reason);
    }

    const recentActivities =
      activitiesSettled.status === 'fulfilled' ? activitiesSettled.value : [];
    if (activitiesSettled.status === 'rejected') {
      console.warn('[home] activities:', activitiesSettled.reason);
    }

    const soul =
      soulSettled.status === 'fulfilled' ? soulSettled.value : NEO_DEFAULT_SOUL;
    if (soulSettled.status === 'rejected') {
      console.warn('[home] soul:', soulSettled.reason);
    }

    const initialProjects =
      projectsSettled.status === 'fulfilled' ? projectsSettled.value : [];
    if (projectsSettled.status === 'rejected') {
      console.warn('[home] projects:', projectsSettled.reason);
    }

    return (
      <div className="neo-home-dashboard cockpit-page">
        <header className="cockpit-header neo-home-header">
          <div className="neo-home-header__titles">
            <h1 className="cockpit-title">ホーム</h1>
            <p className="neo-home-lead">
              記録・サマリー・進行中プロジェクトを一画面に。入力してすぐ今日の数字を把握できます。
            </p>
          </div>
          <Link href="/chat" className="cockpit-header-chat-link">
            フルチャット
          </Link>
        </header>

        <Suspense fallback={null}>
          <DriveConnectionBanner driveLinked={driveLinked} suppressUnlinkedCta={!driveLinked} />
        </Suspense>

        <CockpitDesk
          userId={user.id}
          soul={soul}
          initialActivities={recentActivities}
          initialProjects={initialProjects}
        />

        <footer className="cockpit-page-footer">
          確かなマネーマネジメントを、あなたと共に。
        </footer>
      </div>
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (isNextDynamicServerError(error)) throw error;
    console.error('[home] page error:', error);
    return <HomeFallback />;
  }
}
