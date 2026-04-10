/**
 * コックピット — 2カラムデスク（左: 入力・収支 / 右: プロジェクト）
 * Realtime は chat-realtime のシングルトン経由。router.refresh は使わない。
 */

'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { NeoSoul } from '@/features/soul/server';
import { fetchActivities } from '@/features/activities/actions';
import { fetchProjects } from '@/features/projects/actions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ensureSessionForRealtimeSubscribe,
  isChatRealtimeDisabledFromEnv,
  notifyCockpitDataInvalidate,
  registerCockpitDataInvalidateListener,
  removeNeoCockpitSyncChannel,
  setNeoCockpitSyncChannel,
} from '@/lib/supabase/chat-realtime';
import type { ActivityRow, ProjectRow } from '@/lib/supabase/types';
import { CockpitQuickCapture } from './CockpitQuickCapture';
import { SummaryCards } from './SummaryCards';
import { ActivityFeed } from './ActivityFeed';
import { CockpitProjectFocus } from './CockpitProjectFocus';
import { sanitizeLegacyProjectIdsInLocalStorage } from '@/lib/neo-project-local-storage';
import { calcCockpitSummary } from './cockpit-summary-utils';
import type { CockpitSummary } from './types';

type CockpitDeskProps = {
  userId:             string;
  soul:               NeoSoul;
  initialActivities:  ActivityRow[];
  initialProjects:    ProjectRow[];
};

export function CockpitDesk({
  userId,
  soul,
  initialActivities,
  initialProjects,
}: CockpitDeskProps) {
  /** createBrowserClient はマウント後にだけ生成（SSR レンダーで window/cookie に触れない） */
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>(initialActivities);
  const [projects, setProjects]     = useState<ProjectRow[]>(initialProjects);
  const [summary, setSummary]       = useState<CockpitSummary>(() =>
    calcCockpitSummary(initialActivities),
  );

  useEffect(() => {
    setSupabase(getSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    sanitizeLegacyProjectIdsInLocalStorage();
  }, []);

  const refreshData = useCallback(async () => {
    const [a, p] = await Promise.allSettled([
      fetchActivities({ limit: 20 }),
      fetchProjects(),
    ]);
    const nextActs =
      a.status === 'fulfilled' ? a.value : [];
    const nextProjs =
      p.status === 'fulfilled' ? p.value : [];
    if (a.status === 'rejected') {
      console.warn('[CockpitDesk] fetchActivities:', a.reason);
    }
    if (p.status === 'rejected') {
      console.warn('[CockpitDesk] fetchProjects:', p.reason);
    }
    setActivities(nextActs);
    setProjects(nextProjs);
    setSummary(calcCockpitSummary(nextActs));
  }, []);

  useEffect(() => {
    return registerCockpitDataInvalidateListener(() => {
      void refreshData();
    });
  }, [refreshData]);

  useEffect(() => {
    if (!supabase) return;
    if (isChatRealtimeDisabledFromEnv()) {
      return;
    }
    let cancelled = false;
    const channelRef: { current: RealtimeChannel | null } = { current: null };

    const run = async () => {
      await removeNeoCockpitSyncChannel(supabase, channelRef);
      if (cancelled) return;
      const sessionOk = await ensureSessionForRealtimeSubscribe(supabase);
      if (cancelled || !sessionOk) return;

      const ch = supabase.channel(`neo-cockpit-sync:${userId}`);
      channelRef.current = ch;
      setNeoCockpitSyncChannel(ch);

      ch.on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'activities',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          notifyCockpitDataInvalidate('rt-activities');
        },
      )
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'projects',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            notifyCockpitDataInvalidate('rt-projects');
          },
        )
        .subscribe();
    };

    void run();

    return () => {
      cancelled = true;
      void removeNeoCockpitSyncChannel(supabase, channelRef);
    };
  }, [userId, supabase]);

  return (
    <div className="cockpit-desk-grid">
      <div className="cockpit-desk-col cockpit-desk-col--main">
        <CockpitQuickCapture />
        <SummaryCards summary={summary} />
        <section
          className="cockpit-activity-section"
          aria-labelledby="cockpit-activity-heading"
        >
          <h2 id="cockpit-activity-heading" className="cockpit-activity-heading">
            最新のアクティビティ
          </h2>
          <ActivityFeed activities={activities} soul={soul} userId={userId} />
        </section>
      </div>
      <div className="cockpit-desk-col cockpit-desk-col--projects">
        <CockpitProjectFocus projects={projects} />
      </div>
    </div>
  );
}
