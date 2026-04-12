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
 *   - **export できるのは基本的に async function（と型）** — class の export はビルドエラー（Only async functions are allowed…）
 *   - revalidatePath はここでのみ呼ぶ（Client Component からは呼べない）
 *   - FormData 入力は z.coerce で数値変換する（文字列として来るため）
 *
 * activities 二重運用（移行フェーズ4・INSERT 鉄壁化）
 *
 * **これで二重運用期間が安全になる**（アプリと DB の組み合わせ）:
 *   - INSERT: `ActivityInsertPayload`（型）+ `_assertActivityInsertPayloadHasNoPkKey`（実行時）で `id` / `id_uuid` を絶対に送らない。
 *     DB 側は `scripts/ensure-activities-id-uuid-default.sql` の DEFAULT / NOT NULL / 任意 BEFORE INSERT トリガーで `id_uuid` を常に埋める想定。
 *   - 成功時 `ActionResult` は判別共用体で **`id_uuid` が必須**。`id` はレガシー別名（同じ UUID 文字列）。
 *   - UPDATE / DELETE: 基本は `.eq('id_uuid', lookupId)`。**数字だけ**の文字列（例: "42"）のときだけレガシー int `id` にフォールバック（移行完了後、この分岐ごと削除予定）。
 *   - FETCH: 各行に有効な `id_uuid` がなければ例外。欠けたデータを UI に流さない。
 *   - UI では `activityCanonicalId(row)` を可能な限り使い、`row.id`（number）は触らない。
 *
 * TODO: UUID移行完了後、int4 の `id` 列削除に合わせて型・クエリ・レガシー分岐を整理する。
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
import type { ActivityRow, Database }                 from '@/lib/supabase/types';

/**
 * fetch: PostgREST の列順を固定。先頭を id_uuid にして「メイン ID」をクエリ上でも明示する。
 * 現行 DB に `is_user_corrected` 列が無いため SELECT から除外（列追加後はこの文字列に列名を足す）。
 */
const ACTIVITY_ROW_SELECT =
  'id_uuid, id, user_id, project_id, type, category, title, amount, date, is_bookkeeping, is_deleted, receipt_url, tags, tax_comment, inferred_tax_rate, created_at, updated_at' as const;

/** INSERT 用。`id` / `id_uuid` は含まない（DB 任せ）。 */
type ActivityInsertPayload = Database['public']['Tables']['activities']['Insert'];

// ─── 二重運用: データ整合性 ───────────────────────────────────────

/**
 * fetch 結果に `id_uuid` が欠けているときに投げる。
 * DB が NOT NULL でも、不整合データを早く検知するため。
 *
 * export しない — `'use server'` ファイルでは class の export が禁止されるため。
 */
class ActivityUuidInvariantError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'データ不整合: activities に有効な id_uuid がありません。DB のマイグレーションと NOT NULL 制約を確認してください。',
    );
    this.name = 'ActivityUuidInvariantError';
  }
}

/**
 * 一覧の各行に正規 UUID があるかチェック。1行でも欠ければ例外（続行しない）。
 * ファイル内から同期で呼ぶ用（`asserts` で `ActivityRow[]` に狭める）。
 */
function assertActivityRowsHaveCanonicalUuid(rows: unknown): asserts rows is ActivityRow[] {
  if (!Array.isArray(rows)) {
    throw new ActivityUuidInvariantError('fetchActivities: DB応答が配列ではありません');
  }
  for (const row of rows) {
    const r = row as { id_uuid?: unknown };
    const s = r.id_uuid == null ? '' : String(r.id_uuid).trim();
    if (!isValidUuidString(s)) {
      console.error(
        '[activities] 有効な id_uuid なし（二重運用の前提に反する行）',
        row,
      );
      throw new ActivityUuidInvariantError();
    }
  }
}

/**
 * activities 行配列に正規 `id_uuid` が各行にあるか検証し、問題なければそのまま返す。
 *
 * `'use server'` の制約でエラー class を export できないため、**整合性チェックを載せた async を export** する。
 * 他モジュールから同じ検証が必要ならこちらを await する（失敗時は `Error` で `name === 'ActivityUuidInvariantError'`）。
 */
export async function throwIfInvalidActivityUuid(
  rows: unknown,
): Promise<ActivityRow[]> {
  assertActivityRowsHaveCanonicalUuid(rows);
  return rows;
}

type NeoSoulLoaded = Awaited<ReturnType<typeof loadSoulServer>>;

/** DB エラーなど「冷たい文言」を避けたいときに Soul で一言やわらかくする。 */
async function _soulWarnMessage(
  userId: string,
  raw: string,
  soul: NeoSoulLoaded,
): Promise<string> {
  const out = await runSoulPipeline({
    raw,
    userId,
    soulOverride: soul,
    context: { alertLevel: 'warn' },
  });
  return out.text;
}

/**
 * INSERT ペイロードに PK 列（id / id_uuid）が混入していないか最終確認。
 * 型アサーションでうっかり id を足すミスを、実行時にも防ぐ。
 */
function _assertActivityInsertPayloadHasNoPkKey(payload: ActivityInsertPayload): void {
  const o = payload as Record<string, unknown>;
  if ('id' in o) {
    console.error('[insertActivity] forbidden: `id` must not be sent on insert', payload);
    throw new Error('[activities] INSERT に id（legacy int）を含めないでください');
  }
  if ('id_uuid' in o) {
    console.error('[insertActivity] forbidden: `id_uuid` must not be sent on insert', payload);
    throw new Error('[activities] INSERT に id_uuid を含めないでください（DB の DEFAULT / トリガーに任せる）');
  }
}

/**
 * UPDATE / DELETE 用の照会キー解決。
 * - 通常: UUID → id_uuid 列
 * - 例外: 数字のみの文字列 → レガシー int id（移行完了後、この分岐を削除予定）
 */
function resolveActivityLookup(lookupId: string):
  | { mode: 'uuid'; idUuid: string }
  | { mode: 'legacy_int'; legacyIntId: number }
  | { mode: 'invalid' } {
  const t = lookupId.trim();
  if (isValidUuidString(t)) return { mode: 'uuid', idUuid: t };
  if (/^\d+$/.test(t)) return { mode: 'legacy_int', legacyIntId: Number(t) };
  return { mode: 'invalid' };
}

// ─── 型定義 ─────────────────────────────────────────────────────

/**
 * 収支・プロジェクト等で共有する Server Action 返り値。
 *
 * - **成功 (`ok: true`)** のとき **`id_uuid` が必須**（正規 ID）。`id` は同じ値のレガシー別名。
 * - **失敗 (`ok: false`)** のとき `error`（任意で `code`）。
 *
 * 初心者向け: `if (result.ok) { result.id_uuid }` と書くと TypeScript が `id_uuid` を保証する。
 */
export type ActionResult =
  | {
      ok: true;
      /** 正規 ID（activities なら `id_uuid`、projects なら UUID の `id` と同値）。 */
      id_uuid: string;
      /**
       * レガシー別名（`id_uuid` と同じ UUID 文字列）。
       * TODO: UUID完全移行後、`id` プロパティを廃止し `id_uuid` のみに統一してよい。
       */
      id: string;
      /** Soul が生成した応答テキスト（UI に表示） */
      message?: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      message?: string;
    };

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

    // ⑤ DB 挿入（フェーズ4・INSERT 鉄壁）
    // - クライアントから `id` / `id_uuid` を絶対に送らない。生成は DB の DEFAULT / トリガーに任せる。
    // - 型: `ActivityInsertPayload` … PK をリテラルに書けない。実行時: `_assertActivityInsertPayloadHasNoPkKey` … 混入を検知。
    const supabase = await createServerActionClient();

    const insertPayload: ActivityInsertPayload = {
      user_id:           user.id,
      type:              input.type,
      category:          input.category,
      title:             input.title,
      amount:            input.amount,
      date:              _toISODate(input.date),
      project_id:        input.project_id ?? null,
      is_bookkeeping:    input.is_bookkeeping,
      is_deleted:        false,
      receipt_url:       input.receipt_url ?? null,
      tags:              input.tags ?? null,
      tax_comment:       input.tax_comment ?? null,
      inferred_tax_rate: input.inferred_tax_rate ?? null,
    };
    _assertActivityInsertPayloadHasNoPkKey(insertPayload);

    const { data, error: dbError } = await supabase
      .from('activities')
      .insert(insertPayload)
      .select('id_uuid')
      .single();

    if (dbError) {
      console.error('[insertActivity] DB error:', dbError.code, dbError.message);
      const msg = await _soulWarnMessage(
        user.id,
        'ごめんね、今の記録がうまく保存できなかったみたい。通信を一度確認して、少し時間をおいてからもう一度試してもらえるとうれしいな。',
        soul,
      );
      return { ok: false, error: msg, code: 'DB_ERROR' };
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

    // 新規行の**正規 ID**は常に id_uuid。ここで必ず検証してから返す。
    const newId = data?.id_uuid != null ? String(data.id_uuid).trim() : '';
    if (!isValidUuidString(newId)) {
      console.error('[insertActivity] missing or invalid id_uuid after insert:', data?.id_uuid);
      const msg = await _soulWarnMessage(
        user.id,
        '記録は保存されたかもしれないけれど、IDの確認だけできなかったみたい。一覧を更新してみてね。落ち着いたら、もう一度試してみても大丈夫だよ。',
        soul,
      );
      return { ok: false, error: msg, code: 'DB_ERROR' };
    }

    return {
      ok:      true,
      id_uuid: newId,
      id:      newId,
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
    // `id` はフォーム上の名前。resolveActivityLookup が UUID 優先し、数字のみならレガシー int（移行完了後削除予定）。
    const { id, ...fields } = parsed.data;
    const lookup = resolveActivityLookup(id);

    // 変更フィールドだけ patch に含める（id / id_uuid 列そのものは更新しない）
    // `is_user_corrected` は現行 DB に列が無いため送らない。列を追加する場合は types と INSERT/UPDATE を復活させる。
    const patch: Record<string, unknown> = {};
    if (fields.category  !== undefined) patch.category          = fields.category;
    if (fields.title     !== undefined) patch.title             = fields.title;
    if (fields.amount    !== undefined) patch.amount            = fields.amount;
    if (fields.date      !== undefined) patch.date              = _toISODate(fields.date);
    if (fields.project_id !== undefined) patch.project_id      = fields.project_id;
    if (fields.is_bookkeeping !== undefined) patch.is_bookkeeping = fields.is_bookkeeping;
    if (fields.tags      !== undefined) patch.tags             = fields.tags;
    if (fields.tax_comment !== undefined) patch.tax_comment    = fields.tax_comment;
    if (fields.inferred_tax_rate !== undefined) patch.inferred_tax_rate = fields.inferred_tax_rate;

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: '更新する項目がありません', code: 'VALIDATION_ERROR' };
    }

    const supabase = await createServerActionClient();

    let updateQuery = supabase
      .from('activities')
      .update(patch)
      .eq('user_id', user.id); // RLS + コード側の二重保護

    if (lookup.mode === 'uuid') {
      updateQuery = updateQuery.eq('id_uuid', lookup.idUuid);
    } else if (lookup.mode === 'legacy_int') {
      // TODO: UUID移行完了後に削除予定 — レガシー int 列 `id`へのフォールバック（数値だけを持つ古いクライアント向け）
      updateQuery = updateQuery.eq('id', lookup.legacyIntId);
    } else {
      return { ok: false, error: '無効な ID です', code: 'VALIDATION_ERROR' };
    }

    const { data: updatedRow, error: dbError } = await updateQuery
      .select('id_uuid')
      .maybeSingle();

    if (dbError) {
      console.error('[updateActivity] DB error:', dbError.code, dbError.message);
      const s = await loadSoulServer(user.id);
      const msg = await _soulWarnMessage(
        user.id,
        'ごめんね、更新を最後まで完了できなかったみたい。少し時間をおいてから、もう一度試してもらえると助かるな。',
        s,
      );
      return { ok: false, error: msg, code: 'DB_ERROR' };
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
    const outId =
      updatedRow?.id_uuid != null ? String(updatedRow.id_uuid).trim() : '';
    if (!isValidUuidString(outId)) {
      console.error('[updateActivity] updated row missing id_uuid', updatedRow);
      const msg = await _soulWarnMessage(
        user.id,
        '更新はできたかもしれないけれど、IDの確認だけうまくいかなかったみたい。一覧を更新してみてね。',
        soul,
      );
      return { ok: false, error: msg, code: 'DB_ERROR' };
    }
    return { ok: true, id_uuid: outId, id: outId, message: soulResult.text };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── 収支削除（論理削除） ──────────────────────────────────────────

/**
 * 後方互換: 文字列 ID だけ渡していた呼び出し向け（内部は deleteActivity({ id })）
 * @deprecated 新規コードは deleteActivity({ id }) を直接使うこと
 * @param id — 主に activities.id_uuid（UUID）。数値だけの文字列は移行期の int `id` 照会。
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
    const lookup = resolveActivityLookup(id);

    const supabase = await createServerActionClient();

    let deleteQuery = supabase
      .from('activities')
      .update({ is_deleted: true })
      .eq('user_id', user.id);

    if (lookup.mode === 'uuid') {
      deleteQuery = deleteQuery.eq('id_uuid', lookup.idUuid);
    } else if (lookup.mode === 'legacy_int') {
      // TODO: UUID移行完了後に削除予定 — レガシー int 列 `id` へのフォールバック
      deleteQuery = deleteQuery.eq('id', lookup.legacyIntId);
    } else {
      return { ok: false, error: '無効な ID です', code: 'VALIDATION_ERROR' };
    }

    const { data: deletedRow, error: dbError } = await deleteQuery
      .select('id_uuid')
      .maybeSingle();

    if (dbError) {
      console.error('[deleteActivity] DB error:', dbError.code, dbError.message);
      const s = await loadSoulServer(user.id);
      const msg = await _soulWarnMessage(
        user.id,
        'ごめんね、削除の処理を最後まで終えられなかったみたい。少し待ってから、もう一度試してみてね。',
        s,
      );
      return { ok: false, error: msg, code: 'DB_ERROR' };
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
    const outId =
      deletedRow?.id_uuid != null ? String(deletedRow.id_uuid).trim() : '';
    if (!isValidUuidString(outId)) {
      console.error('[deleteActivity] row missing id_uuid after delete', deletedRow);
      const msg = await _soulWarnMessage(
        user.id,
        '削除は進んだかもしれないけれど、IDの確認ができなかったみたい。一覧を更新して状態を見てみてね。',
        soul,
      );
      return { ok: false, error: msg, code: 'DB_ERROR' };
    }
    return { ok: true, id_uuid: outId, id: outId, message: soulResult.text };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── 収支一覧取得 ─────────────────────────────────────────────────

export async function fetchActivities(opts?: {
  limit?:     number;
  /** Filter by `projects.id_uuid` (value stored in column `activities.project_id`). */
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

    const projectIdUuid = o.projectId;

    if (projectIdUuid) {
      console.log('[fetchActivities] filter by projects.id_uuid →', projectIdUuid);
    }

    const supabase = await createServerActionClient();

    // 列順で id_uuid を先頭に固定（メイン ID をクエリ上でも明示）
    let query = supabase
      .from('activities')
      .select(ACTIVITY_ROW_SELECT)
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    // activities.project_id には projects.id_uuid を入れる（列名は据え置き）
    if (projectIdUuid) query = query.eq('project_id', projectIdUuid);
    if (o.type)      query = query.eq('type', o.type);
    if (o.dateFrom)  query = query.gte('date', o.dateFrom);
    if (o.dateTo)    query = query.lte('date', o.dateTo);
    if (o.limit)     query = query.limit(o.limit);

    const { data, error: dbError } = await query;

    if (dbError) {
      console.error('[fetchActivities] DB error:', dbError.code, dbError.message);
      return [];
    }
    const rows = data ?? [];
    // 二重運用の前提: 各行に id_uuid。欠けは即エラー（throwIfInvalidActivityUuid 経由）
    return await throwIfInvalidActivityUuid(rows);
  } catch (err) {
    if (err instanceof ActivityUuidInvariantError) throw err;
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
