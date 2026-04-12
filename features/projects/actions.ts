/**
 * features/projects/actions.ts
 * Server Actions — プロジェクト CRUD（読み取り + Agentic からの新規作成）
 *
 * projects 二重運用（activities と同じ方式）:
 * - **正規 ID**: `id_uuid`（fetch・URL・`activities.project_id`）
 * - **legacy**:整数 `id`。**数字だけ**の文字列で来たときだけ `.eq('id', …)` にフォールバック（移行完了後に削除予定）
 * - DB: `scripts/migrate-projects-add-id-uuid.sql` で `id_uuid` を追加・バックフィル・NOT NULL
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
import type { ProjectRow, ProjectsFetchRow, Database } from '@/lib/supabase/types';
import type { ActionResult } from '@/features/activities/actions';

/**
 * Project list/detail SELECT. Includes `id_uuid` first; rows match `ProjectsFetchRow`.
 */
const PROJECT_ROW_SELECT =
  'id_uuid, id, user_id, name, category, color, status, location, revenue, has_unpaid, note, client_name, payment_deadline, bank_info, currency, last_updated, created_at, is_deleted' as const;

type ProjectInsertPayload = Database['public']['Tables']['projects']['Insert'];

// ─── データ整合性（各行に有効な id_uuid） ─────────────────────────

class ProjectUuidInvariantError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'データ不整合: projects に有効な id_uuid がありません。migrate-projects-add-id-uuid.sql を実行したか確認してください。',
    );
    this.name = 'ProjectUuidInvariantError';
  }
}

function assertProjectRowsHaveCanonicalUuid(rows: unknown): asserts rows is ProjectRow[] {
  if (!Array.isArray(rows)) {
    throw new ProjectUuidInvariantError('fetchProjects: DB応答が配列ではありません');
  }
  for (const row of rows) {
    const r = row as { id_uuid?: unknown };
    const s = r.id_uuid == null ? '' : String(r.id_uuid).trim();
    if (!isValidUuidString(s)) {
      console.error('[projects] 有効な id_uuid なし', row);
      throw new ProjectUuidInvariantError();
    }
  }
}

/**
 * 1件取得・ルート param 用。UUID 優先、**数字だけ**なら legacy int `id`（移行完了後にこの分岐を削除予定）
 */
function resolveProjectLookup(lookupId: string):
  | { mode: 'uuid'; idUuid: string }
  | { mode: 'legacy_int'; legacyIntId: number }
  | { mode: 'invalid' } {
  const t = lookupId.trim();
  if (isValidUuidString(t)) return { mode: 'uuid', idUuid: t };
  if (/^\d+$/.test(t)) return { mode: 'legacy_int', legacyIntId: Number(t) };
  return { mode: 'invalid' };
}

function _assertProjectInsertPayloadHasNoPkKey(payload: ProjectInsertPayload): void {
  const o = payload as Record<string, unknown>;
  if ('id' in o) {
    console.error('[insertProject] forbidden: `id` must not be sent on insert', payload);
    throw new Error('[projects] INSERT に id（legacy int）を含めないでください');
  }
  if ('id_uuid' in o) {
    console.error('[insertProject] forbidden: `id_uuid` must not be sent on insert', payload);
    throw new Error('[projects] INSERT に id_uuid を含めないでください（DB の DEFAULT に任せる）');
  }
}

export async function fetchProjectById(projectId: string): Promise<ProjectsFetchRow | null> {
  try {
    const lookup = resolveProjectLookup(projectId);
    if (lookup.mode === 'invalid') {
      console.warn('[fetchProjectById] invalid id:', projectId);
      return null;
    }

    const user = await requireAuth();
    await checkRateLimit(`project:fetch-one:${user.id}`, RATE_LIMIT_PRESETS.projectFetch);

    const supabase = await createServerActionClient();
    let q = supabase
      .from('projects')
      .select(PROJECT_ROW_SELECT)
      .eq('user_id', user.id);

    if (lookup.mode === 'uuid') {
      q = q.eq('id_uuid', lookup.idUuid);
    } else {
      // TODO: UUID移行完了後に削除予定 — legacy int 列 `id` へのフォールバック
      q = q.eq('id', lookup.legacyIntId);
    }

    const { data, error } = await q.maybeSingle();

    if (error) {
      console.error('[fetchProjectById] DB error:', error.code, error.message);
      return null;
    }
    if (!data) return null;
    assertProjectRowsHaveCanonicalUuid([data]);
    return data;
  } catch (err) {
    if (err instanceof ProjectUuidInvariantError) throw err;
    if (isNextRedirectError(err)) throw err;
    if (err instanceof Error && err.message === 'RATE_LIMITED') {
      throw err;
    }
    console.warn('[fetchProjectById] Unexpected:', err);
    return null;
  }
}

/** @returns 各行に `id_uuid: string` を含む（`PROJECT_ROW_SELECT` で取得） */
export async function fetchProjects(): Promise<ProjectsFetchRow[]> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`project:fetch:${user.id}`, RATE_LIMIT_PRESETS.projectFetch);

    const supabase = await createServerActionClient();
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_ROW_SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fetchProjects] DB error:', error.code, error.message);
      return [];
    }
    const rows = data ?? [];
    assertProjectRowsHaveCanonicalUuid(rows);
    return rows;
  } catch (err) {
    if (err instanceof ProjectUuidInvariantError) throw err;
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
 * - `id` / `id_uuid` は指定しない（DB の serial + DEFAULT に任せる）
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

    const insertPayload: ProjectInsertPayload = {
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
    };
    _assertProjectInsertPayloadHasNoPkKey(insertPayload);

    const { data, error: dbError } = await supabase
      .from('projects')
      .insert(insertPayload)
      .select('id_uuid')
      .single();

    if (dbError) {
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

    const idStr = data?.id_uuid != null ? String(data.id_uuid).trim() : '';
    if (!isValidUuidString(idStr)) {
      console.error('[insertProject] Invalid id_uuid — raw:', data?.id_uuid);
      return {
        ok:    false,
        error: 'プロジェクトIDの形式が正しくありませんでした（UUID ではない値が返りました）。',
        code:  'DB_ERROR',
      };
    }

    console.log(`[insertProject] OK id_uuid=${idStr} name=${input.name}`);

    revalidatePath('/', 'layout');
    revalidatePath('/cockpit', 'layout');
    revalidatePath('/projects', 'layout');
    revalidatePath(`/projects/${idStr}`, 'layout');

    return {
      ok:      true,
      id_uuid: idStr,
      id:      idStr,
      message: `新規プロジェクト「${input.name}」を作成しました。`,
    };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}
