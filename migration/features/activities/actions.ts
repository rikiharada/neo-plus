/**
 * features/activities/actions.ts
 * Server Actions — 収支データの CRUD
 *
 * セキュリティ設計（4層防御）:
 *   1. requireAuth()       → JWT 検証（Supabase Auth サーバーと通信）
 *   2. checkRateLimit()    → API 乱用防止（1分 60件上限）
 *   3. Zod スキーマ検証    → 入力サニタイズ（XSS / 不正型対策）
 *   4. RLS + .eq('user_id', user.id) → DB レベルの所有権チェック
 *
 * Soul 統合:
 *   - insert / update / delete 後に runSoulPipeline() を必ず通す
 *   - Soul はテキスト生成のみ担当（DB 操作とは分離）
 *
 * ⚠️ 落とし穴:
 *   - 'use server' はファイル先頭に必須
 *   - revalidatePath はここでのみ呼ぶ（Client Component からは呼べない）
 *   - FormData 入力は z.coerce で数値変換する（文字列として来るため）
 */

'use server';

import { revalidatePath }                              from 'next/cache';
import { APP_HOME_HREF }                               from '@/components/app-nav-config';
import {
  requireAuth,
  handleServerActionError,
  isNextRedirectError,
} from '@/lib/supabase/server';
import { createServerActionClient }                    from '@/lib/supabase/server';
import {
  ActivityInsertSchema,
  ActivityUpdateSchema,
  ActivityDeleteSchema,
  FetchActivitiesOptsSchema,
  formatZodError,
  isValidUuidString,
}                                                      from '@/lib/validation';
import { checkRateLimit, RATE_LIMIT_PRESETS }          from '@/lib/rate-limit';
import { loadSoulServer }                              from '@/features/soul/server';
import { runSoulPipeline }                             from '@/lib/soul-pipeline';
import type { ActivityRow }                            from '@/lib/supabase/types';

// ─── 型定義 ─────────────────────────────────────────────────────

export interface ActionResult {
  ok:       boolean;
  id?:      string;
  /** Soul が生成した応答テキスト（UI に表示） */
  message?: string;
  error?:   string;
  code?:    string;
}

// ─── 収支登録 ─────────────────────────────────────────────────────

export async function insertActivity(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    // ① 認証（JWT を Supabase サーバーで検証）
    const user = await requireAuth();

    // ② レート制限（1分間に 60件 まで）
    await checkRateLimit(`activity:insert:${user.id}`, RATE_LIMIT_PRESETS.activityInsert);

    // ③ 入力バリデーション（Zod）
    const parsed = ActivityInsertSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error), code: 'VALIDATION_ERROR' };
    }
    const input = parsed.data;

    // ④ Soul ロード（5分キャッシュ付き）
    const soul = await loadSoulServer(user.id);

    // ⑤ DB 挿入（RLS が user_id を保証 + コード側でも .eq() で二重保護）
    const supabase = await createServerActionClient();

    const { data, error: dbError } = await supabase
      .from('activities')
      .insert({
        user_id:           user.id,
        type:              input.type,
        category:          input.category,
        title:             input.title,
        amount:            input.amount,
        date:              _toISODate(input.date),
        project_id:        input.project_id ?? null,
        is_bookkeeping:    input.is_bookkeeping,
        is_user_corrected: false,
        is_deleted:        false,
        receipt_url:       input.receipt_url ?? null,
        tags:              input.tags ?? null,
        tax_comment:       input.tax_comment ?? null,
        inferred_tax_rate: input.inferred_tax_rate ?? null,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('[insertActivity] DB error:', dbError.code, dbError.message);
      const failSoul = await runSoulPipeline({
        raw:
          'データの保存に失敗しちゃったみたい。ちょっと接続が不安定みたい…。少し待ってから、もう一度試してみようか？',
        userId:       user.id,
        soulOverride: soul,
        context:      { alertLevel: 'warn' },
      });
      return { ok: false, error: failSoul.text, code: 'DB_ERROR' };
    }

    // ⑥ Soul パイプライン（統一後処理）
    const baseMessage = `「${input.title}」¥${input.amount.toLocaleString('ja-JP')} を記録しました。`;
    const soulResult = await runSoulPipeline({
      raw:     baseMessage,
      userId:  user.id,
      soulOverride: soul,  // 既にロード済みなので再取得しない
      context: {
        activityCategory: input.category,
        todayEntryCount:  1,  // 挿入後なので最低1
      },
    });

    // ⑦ キャッシュ無効化
    revalidatePath('/', 'layout');
    revalidatePath(APP_HOME_HREF, 'layout');
    revalidatePath('/projects', 'layout');
    if (input.project_id && isValidUuidString(input.project_id)) {
      revalidatePath(`/projects/${input.project_id}`, 'layout');
    }

    return {
      ok:      true,
      id:      data.id,
      message: soulResult.text,
    };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── 収支更新 ─────────────────────────────────────────────────────

export async function updateActivity(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`activity:update:${user.id}`, RATE_LIMIT_PRESETS.activityUpdate);

    const parsed = ActivityUpdateSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error), code: 'VALIDATION_ERROR' };
    }
    const { id, ...fields } = parsed.data;

    // 変更フィールドだけ patch に含める
    const patch: Record<string, unknown> = { is_user_corrected: true };
    if (fields.category  !== undefined) patch.category          = fields.category;
    if (fields.title     !== undefined) patch.title             = fields.title;
    if (fields.amount    !== undefined) patch.amount            = fields.amount;
    if (fields.date      !== undefined) patch.date              = _toISODate(fields.date);
    if (fields.project_id !== undefined) patch.project_id      = fields.project_id;
    if (fields.is_bookkeeping !== undefined) patch.is_bookkeeping = fields.is_bookkeeping;
    if (fields.tags      !== undefined) patch.tags             = fields.tags;
    if (fields.tax_comment !== undefined) patch.tax_comment    = fields.tax_comment;
    if (fields.inferred_tax_rate !== undefined) patch.inferred_tax_rate = fields.inferred_tax_rate;

    const supabase = await createServerActionClient();

    const { data: updatedRow, error: dbError } = await supabase
      .from('activities')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)  // RLS + コード側の二重保護
      .select('id')
      .maybeSingle();

    if (dbError) {
      console.error('[updateActivity] DB error:', dbError.code, dbError.message);
      return { ok: false, error: '更新に失敗しました', code: 'DB_ERROR' };
    }
    if (!updatedRow) {
      return { ok: false, error: '該当する記録が見つかりません', code: 'NOT_FOUND' };
    }

    // Soul パイプライン
    const soul = await loadSoulServer(user.id);
    const soulResult = await runSoulPipeline({
      raw:          `「${fields.title ?? '記録'}」を更新しました。`,
      userId:       user.id,
      soulOverride: soul,
    });

    revalidatePath(APP_HOME_HREF);
    return { ok: true, id, message: soulResult.text };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── 収支削除（論理削除） ──────────────────────────────────────────

/**
 * 後方互換: 文字列 ID だけ渡していた呼び出し向け（内部は deleteActivity({ id })）
 * @deprecated 新規コードは deleteActivity({ id }) を直接使うこと
 */
export async function deleteActivityById(id: string): Promise<ActionResult> {
  return deleteActivity({ id });
}

export async function deleteActivity(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`activity:delete:${user.id}`, RATE_LIMIT_PRESETS.activityDelete);

    const parsed = ActivityDeleteSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error), code: 'VALIDATION_ERROR' };
    }
    const { id } = parsed.data;

    const supabase = await createServerActionClient();

    const { data: deletedRow, error: dbError } = await supabase
      .from('activities')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (dbError) {
      console.error('[deleteActivity] DB error:', dbError.code, dbError.message);
      return { ok: false, error: '削除に失敗しました', code: 'DB_ERROR' };
    }
    if (!deletedRow) {
      return { ok: false, error: '該当する記録が見つかりません', code: 'NOT_FOUND' };
    }

    const soul = await loadSoulServer(user.id);
    const soulResult = await runSoulPipeline({
      raw:          '記録を削除しました。',
      userId:       user.id,
      soulOverride: soul,
      context:      { todayEntryCount: 1 },
    });

    revalidatePath(APP_HOME_HREF);
    return { ok: true, id, message: soulResult.text };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── 収支一覧取得 ─────────────────────────────────────────────────

export async function fetchActivities(opts?: {
  limit?:     number;
  projectId?: string;
  type?:      'expense' | 'income' | 'transfer';
  dateFrom?:  string;
  dateTo?:    string;
}): Promise<ActivityRow[]> {
  try {
    const user = await requireAuth();
    await checkRateLimit(`activity:fetch:${user.id}`, RATE_LIMIT_PRESETS.activityFetch);

    const raw = opts ?? {};
    if (raw.projectId !== undefined && raw.projectId !== null) {
      if (typeof raw.projectId !== 'string') {
        console.warn(
          '[fetchActivities] projectId must be a UUID string, got',
          typeof raw.projectId,
          raw.projectId,
        );
        return [];
      }
      const pid = raw.projectId.trim();
      if (
        pid === '' ||
        pid === 'undefined' ||
        pid === 'null' ||
        !isValidUuidString(pid)
      ) {
        console.warn(
          '[fetchActivities] invalid projectId; skip query:',
          raw.projectId,
        );
        return [];
      }
      raw.projectId = pid;
    }

    const optsParsed = FetchActivitiesOptsSchema.safeParse(raw);
    if (!optsParsed.success) {
      console.warn('[fetchActivities] Invalid opts:', formatZodError(optsParsed.error));
      return [];
    }
    const o = optsParsed.data;

    if (o.projectId) {
      console.log('[fetchActivities] fetching with UUID:', o.projectId);
    }

    const supabase = await createServerActionClient();

    let query = supabase
      .from('activities')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (o.projectId) query = query.eq('project_id', o.projectId);
    if (o.type)      query = query.eq('type', o.type);
    if (o.dateFrom)  query = query.gte('date', o.dateFrom);
    if (o.dateTo)    query = query.lte('date', o.dateTo);
    if (o.limit)     query = query.limit(o.limit);

    const { data, error: dbError } = await query;

    if (dbError) {
      console.error('[fetchActivities] DB error:', dbError.code, dbError.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    if (err instanceof Error && err.message === 'RATE_LIMITED') {
      throw err;
    }
    console.warn('[fetchActivities] Unexpected:', err);
    return [];
  }
}

// ─── ユーティリティ ──────────────────────────────────────────────

function _toISODate(raw: string): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw.replace(/\//g, '-'));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
