/**
 * features/projects/actions.ts
 * Server Actions — プロジェクト読み取り（RLS + user_id 二重指定）
 */

'use server';

import { requireAuth, isNextRedirectError } from '@/lib/supabase/server';
import { createServerActionClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import type { ProjectRow } from '@/lib/supabase/types';

export async function fetchProjects(): Promise<ProjectRow[]> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`project:fetch:${user.id}`, RATE_LIMIT_PRESETS.projectFetch);

    const supabase = await createServerActionClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fetchProjects] DB error:', error.code, error.message);
      return [];
    }
    return (data ?? []) as ProjectRow[];
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    if (err instanceof Error && err.message === 'RATE_LIMITED') {
      throw err;
    }
    console.warn('[fetchProjects] Unexpected:', err);
    return [];
  }
}
