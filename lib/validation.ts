/**
 * lib/validation.ts
 * Zod スキーマ定義 — Server Actions の入力バリデーション
 *
 * ルール:
 *   - すべての Server Action 入力はここのスキーマで検証する
 *   - `.safeParse()` を使い、エラー時は日本語メッセージを返す
 *   - 型は `.infer<>` でスキーマから生成（手書きの型定義と乖離しない）
 *
 * 使い方:
 *   const parsed = ActivityInsertSchema.safeParse(input);
 *   if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
 *   const data = parsed.data;  // 型安全
 */

import { z } from 'zod';

// ─── 共通プリミティブ ────────────────────────────────────────────

/** YYYY-MM-DD または YYYY/MM/DD を受け付け ISO に変換 */
const DateString = z
  .string()
  .min(1, '日付は必須です')
  .transform((val) => val.replace(/\//g, '-'))
  .refine(
    (val) => !isNaN(new Date(val).getTime()),
    '正しい日付を入力してください（例: 2024-01-15）',
  );

const PositiveInt = z
  .number({ invalid_type_error: '金額は数値を入力してください' })
  .int('金額は整数で入力してください')
  .positive('金額は1円以上を入力してください')
  .max(999_999_999, '金額が大きすぎます');

const ActivityType = z.enum(['expense', 'income', 'transfer'], {
  errorMap: () => ({ message: '種別は expense / income / transfer のいずれかです' }),
});

const UUIDString = z.string().uuid('無効な ID です');

/** project_id / fetchActivities 用（空・"undefined" 文字列などを除外） */
export function isValidUuidString(value: string): boolean {
  return z.string().uuid().safeParse(value.trim()).success;
}

/**
 * 収支1件の照会用 ID（二重運用期間）。
 * - 通常: `activities.id_uuid`（UUID 文字列）— これを最優先で使う。
 * - 例外: まだ数値だけ持っている古いクライアント向けに、10 進数字列のみ許可（DB の int4 `id`）。
 *   TODO: UUID完全移行後、この分岐と数値許可を削除し UUID のみにする。
 */
export const ActivityLookupIdSchema = z
  .string({ required_error: 'ID を入力してください' })
  .min(1, 'ID を入力してください')
  .transform((s) => s.trim())
  .refine(
    (s) => isValidUuidString(s) || /^\d+$/.test(s),
    '無効な ID です（UUID またはレガシー数値 ID）',
  );

const ShortText = (label: string) =>
  z
    .string({ required_error: `${label}は必須です` })
    .min(1, `${label}を入力してください`)
    .max(200, `${label}は200文字以内で入力してください`)
    .transform((s) => s.trim());

// ─── 収支登録スキーマ ─────────────────────────────────────────────

export const ActivityInsertSchema = z.object({
  type:               ActivityType,
  category:           ShortText('カテゴリ'),
  title:              ShortText('タイトル'),
  amount:             PositiveInt,
  date:               DateString,
  project_id:         UUIDString.nullable().optional(),
  is_bookkeeping:     z.boolean().optional().default(false),
  /** Drive の webViewLink 等（Zero-Server: 実体は Drive 側） */
  receipt_url:        z.string().max(2048).nullable().optional(),
  tags:               z.array(z.string().max(50)).max(10).optional(),
  tax_comment:        z.string().max(500).nullable().optional(),
  inferred_tax_rate:  z.string().max(20).nullable().optional(),
});

export type ActivityInsertInput = z.infer<typeof ActivityInsertSchema>;

// ─── 収支更新スキーマ ─────────────────────────────────────────────

export const ActivityUpdateSchema = z.object({
  /** 主に activities.id_uuid。数値のみの文字列はレガシー int `id` 照会（移行完了まで）。 */
  id:                 ActivityLookupIdSchema,
  category:           ShortText('カテゴリ').optional(),
  title:              ShortText('タイトル').optional(),
  amount:             PositiveInt.optional(),
  date:               DateString.optional(),
  project_id:         UUIDString.nullable().optional(),
  is_bookkeeping:     z.boolean().optional(),
  tags:               z.array(z.string().max(50)).max(10).optional(),
  tax_comment:        z.string().max(500).nullable().optional(),
  inferred_tax_rate:  z.string().max(20).nullable().optional(),
});

export type ActivityUpdateInput = z.infer<typeof ActivityUpdateSchema>;

// ─── 収支削除（単一 ID） ─────────────────────────────────────────

export const ActivityDeleteSchema = z.object({
  /** 主に activities.id_uuid。数値文字列はレガシー int `id`（移行完了まで）。 */
  id: ActivityLookupIdSchema,
});

export type ActivityDeleteInput = z.infer<typeof ActivityDeleteSchema>;

// ─── 収支一覧クエリ（Server Action の opts） ───────────────────────

/** fetchActivities: projectId = `projects.id_uuid`（UUID 文字列のみ。legacy 数値は不可） */
export const FetchActivitiesOptsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    projectId: z
      .string()
      .uuid({ message: 'projectId は UUID 形式の文字列である必要があります' })
      .optional(),
    type:     z.enum(['expense', 'income', 'transfer']).optional(),
    dateFrom: z.string().max(32).optional(),
    dateTo:   z.string().max(32).optional(),
  })
  .strict();

export type FetchActivitiesOptsInput = z.infer<typeof FetchActivitiesOptsSchema>;

// ─── チャット入力スキーマ ─────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role:      z.enum(['user', 'assistant']),
  content:   z.string().min(1).max(5000),
  timestamp: z.string().datetime({ message: '正しい日時形式ではありません' }),
  /** クライアント履歴用: Neo の <goal> 要約（サーバーは無視可） */
  goalSummary: z.string().max(2000).optional(),
  planSummary: z.string().max(4000).optional(),
});

/** Agentic 確認フロー: クライアントが保持していたアクションをユーザー承認後に送る */
export const PendingActionConfirmSchema = z.object({
   type: z.enum([
    'INSERT_PROJECT',
    'INSERT_ACTIVITY',
    'UPDATE_ACTIVITY',
    'DELETE_ACTIVITY',
    'SHOW_SUMMARY',
    'NAVIGATE',
    'UNKNOWN',
  ]),
  payload:     z.record(z.unknown()),
  autoExecute: z.boolean().optional(),
});

/** Agentic `<actions>` 内のプロジェクト作成（DB `projects` 行の最小セット） */
/** Gemini / フロントから `id` を渡させない（PK は DB の gen_random_uuid のみ） */
export const AgenticProjectInsertSchema = z
  .object({
    name:        ShortText('プロジェクト名'),
    category:    z.string().max(200).trim().optional(),
    note:        z.string().max(1000).optional(),
    client_name: z.string().max(200).nullable().optional(),
    location:    z.string().max(200).nullable().optional(),
  })
  .strict();

export const HandleInstructionSchema = z
  .object({
    message: z
      .string({ required_error: 'メッセージは必須です' })
      .min(1, 'メッセージを入力してください')
      .max(2000, 'メッセージは2000文字以内で入力してください')
      .transform((s) => s.trim()),
    history: z.array(ChatMessageSchema).max(20).optional().default([]),
    /** 前ターンで提案されたアクション（ユーザーが「実行して」等と送ったときに同梱） */
    pendingActionsToConfirm: z.array(PendingActionConfirmSchema).max(8).optional(),
    /**
     * サーバー発行の承認トークン（HMAC）。pendingActionsToConfirm と同時必須。
     */
    pendingApprovalToken: z.string().min(32).max(512).optional(),
    pendingApprovalNonce: z.string().uuid().optional(),
    pendingApprovalIssuedAt: z.coerce.number().int().positive().optional(),
    /** Dev: 1st turn sets true; client echoes on confirm (server still verifies HMAC + TTL). */
    pendingApprovalDevBypass: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const n = data.pendingActionsToConfirm?.length ?? 0;
    if (n < 1) return;
    if (
      !data.pendingApprovalToken ||
      !data.pendingApprovalNonce ||
      data.pendingApprovalIssuedAt == null
    ) {
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        message:
          '承認実行には pendingApprovalToken / pendingApprovalNonce / pendingApprovalIssuedAt が必要です',
        path:    ['pendingApprovalToken'],
      });
    }
  });

export type HandleInstructionInput = z.infer<typeof HandleInstructionSchema>;

// ─── Google Drive アップロード（FormData の kind 用） ─────────────

export const DriveUploadKindSchema = z.enum(
  ['receipt', 'invoice', 'site_photo', 'other'],
  {
    errorMap: () => ({ message: '種別が正しくありません' }),
  },
);

export type DriveUploadKind = z.infer<typeof DriveUploadKindSchema>;

// ─── プロジェクト作成スキーマ ─────────────────────────────────────

export const ProjectInsertSchema = z.object({
  name:        ShortText('プロジェクト名'),
  client_name: ShortText('クライアント名').optional(),
  status:      z.enum(['active', 'completed', 'paused']).default('active'),
  start_date:  DateString.optional(),
  end_date:    DateString.optional(),
  budget:      PositiveInt.optional(),
  description: z.string().max(1000).optional(),
  color:       z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'カラーは #RRGGBB 形式で入力してください')
    .optional(),
});

export type ProjectInsertInput = z.infer<typeof ProjectInsertSchema>;

/** ベータフィードバック（サイドバーから送信） */
export const FeedbackSubmitSchema = z.object({
  kind:    z.enum(['bug', 'idea', 'other']),
  message: z
    .string()
    .min(1, '内容を入力してください')
    .max(4000, '4000文字以内でお願いします'),
  pagePath: z.string().max(512).optional(),
});

export type FeedbackSubmitInput = z.infer<typeof FeedbackSubmitSchema>;

// ─── エラーフォーマッター ────────────────────────────────────────

/**
 * Zod エラーを UI 表示用の日本語文字列に変換する。
 * 最初のエラーのみを返す（複数エラーを一度に出すと UX が悪い）。
 */
export function formatZodError(error: z.ZodError): string {
  const first = error.errors[0];
  if (!first) return '入力内容に問題があります';
  return first.message;
}

/**
 * Zod エラーをフィールドごとのマップに変換する（フォームバリデーション用）。
 */
export function zodErrorToFieldMap(
  error: z.ZodError,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.');
    if (key && !map[key]) {
      map[key] = issue.message;
    }
  }
  return map;
}
