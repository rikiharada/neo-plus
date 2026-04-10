/**
 * features/projects/actions.ts
 * Server Actions — プロジェクト CRUD（読み取り + Agentic からの新規作成）
 */

'use server';

import { revalidatePath } from 'next/cache';
import {
  requireAuth,
  isNextRedirectError,
  handleServerActionError,
} from '@/lib/supabase/server';
import { createServerActionClient } from '@/lib/supabase/server';
import {
  AgenticProjectInsertSchema,
  formatZodError,
  isValidUuidString,
} from '@/lib/validation';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { filterProjectsWithValidUuidIds } from '@/lib/project-display-utils';
import type { ProjectRow } from '@/lib/supabase/types';
import type { ActionResult } from '@/features/activities/actions';

export async function fetchProjectById(projectId: string): Promise<ProjectRow | null> {
  try {
    if (!isValidUuidString(projectId)) {
      console.warn('[fetchProjectById] rejected non-UUID id:', projectId);
      return null;
    }
    const user = await requireAuth();
    await checkRateLimit(`project:fetch-one:${user.id}`, RATE_LIMIT_PRESETS.projectFetch);

    const supabase = await createServerActionClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', projectId)
      .maybeSingle();

    if (error) {
      console.error('[fetchProjectById] DB error:', error.code, error.message);
      return null;
    }
    return data as ProjectRow | null;
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    if (err instanceof Error && err.message === 'RATE_LIMITED') {
      throw err;
    }
    console.warn('[fetchProjectById] Unexpected:', err);
    return null;
  }
}

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
    const rows = (data ?? []) as ProjectRow[];
    const valid = filterProjectsWithValidUuidIds(rows);
    const droppedCount = rows.length - valid.length;
    if (droppedCount > 0) {
      // UUID 形式でない id を持つ行を除外（旧スキーマの bigserial 行など）。
      // 毎回ログが出る場合は Supabase migration で projects.id を uuid 型に統一し、
      // 旧データを削除または UUID に変換してください。
      // ─ 開発環境: 毎回表示 / 本番: 初回のみ（重複ログ防止）
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[fetchProjects] dropped ${droppedCount} row(s) with non-UUID id.` +
          ' Run DB migration to fix: ALTER TABLE projects ALTER COLUMN id TYPE uuid USING id::uuid;',
        );
      }
    }
    return valid;
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    if (err instanceof Error && err.message === 'RATE_LIMITED') {
      throw err;
    }
    console.warn('[fetchProjects] Unexpected:', err);
    return [];
  }
}

/**
 * Agentic `INSERT_PROJECT`
 * - `id` は指定しない（DB 側の UUID 生成に任せる）
 * - `user_id` は必ず `requireAuth()` のユーザー
 */
export async function insertProject(rawInput: unknown): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`project:insert:${user.id}`, RATE_LIMIT_PRESETS.projectInsert);

    const parsed = AgenticProjectInsertSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error), code: 'VALIDATION_ERROR' };
    }
    const input = parsed.data;
    const supabase = await createServerActionClient();

    const { data, error: dbError } = await supabase
      .from('projects')
      .insert({
        user_id:          user.id,
        name:             input.name.trim(),
        category:         (input.category?.trim() || '案件').slice(0, 200),
        color:            '#6366F1',
        status:           'active',
        location:         input.location ?? null,
        revenue:          0,
        has_unpaid:       false,
        note:             input.note?.trim() ?? null,
        client_name:      input.client_name ?? null,
        payment_deadline: null,
        bank_info:        null,
        currency:         'JPY',
        last_updated:     null,
        is_deleted:       false,
      })
      .select('id')
      .single();

    if (dbError) {
      // Supabase のエラー詳細（code/details/hint）をすべてログに残してデバッグしやすくする。
      // よくある原因: RLS ポリシー違反 / テーブル列の不一致 / UUID 型制約違反
      console.error('[insertProject] DB error:', {
        code:    dbError.code,
        message: dbError.message,
        details: (dbError as { details?: string }).details,
        hint:    (dbError as { hint?: string }).hint,
      });
      return {
        ok:    false,
        error: `プロジェクト作成に失敗しました: ${dbError.message}`,
        code:  'DB_ERROR',
      };
    }

    const idStr = String(data?.id ?? '').trim();
    if (!isValidUuidString(idStr)) {
      console.error('[insertProject] Invalid UUID returned — raw value:', data?.id, '| type:', typeof data?.id);
      return {
        ok:    false,
        error: 'プロジェクトIDの形式が正しくありませんでした（UUID ではない値が返りました）。',
        code:  'DB_ERROR',
      };
    }

    console.log(`[insertProject] OK uuid=${idStr} name=${input.name}`);

    // 'layout' を付与して /projects/[id] 詳細ページまでキャッシュ無効化が伝播するようにする。
    revalidatePath('/', 'layout');
    revalidatePath('/cockpit', 'layout');
    revalidatePath('/projects', 'layout');
    revalidatePath(`/projects/${idStr}`, 'layout');

    return {
      ok:      true,
      id:      idStr,
      message: `新規プロジェクト「${input.name}」を作成しました。`,
    };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}
