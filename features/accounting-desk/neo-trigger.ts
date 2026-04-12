/**
 * features/accounting-desk/neo-trigger.ts
 * Ledger Desk — Neo の「第一声」を生成する Server Action
 *
 * ⚠️ 必須ルール:
 *   - 文字列を直返し禁止。必ず runSoulPipeline() を通すこと
 *   - 解析結果から raw テンプレートを作り、Soul Pipeline が仕上げる
 *   - エラー時も Soul Pipeline で丸める（冷たいシステムメッセージを出さない）
 *
 * 第一声テンプレート（Soul への raw input）:
 *   CSV   : 「{name} を読み込めた。{N}件のデータがあって、{列}には合計¥{合計}ある。仕訳から始める？それとも月次サマリー見る？」
 *   Excel : 「{name}、{N}シートあるね。どのシートから作業しようか？（{list}）」
 *   PDF   : 「領収書かな？読み取ってみるね、少し待って」
 *   Image : 「領収書の写真かな？読み取ってみるね、少し待って」
 *   Error : 「うまく読み込めなかった。もう一度試してみて」
 */

'use server';

import {
  requireAuth,
  getAuthenticatedUser,
  handleServerActionError,
  isNextRedirectError,
} from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMIT_PRESETS }   from '@/lib/rate-limit';
import { loadSoulServer }                        from '@/features/soul/server';
import { runSoulPipeline }                       from '@/lib/soul-pipeline';
import type { FileAnalysisResult }               from '@/features/accounting-desk/file-analyzer';
import { z }                                     from 'zod';

// ─── 入力スキーマ ────────────────────────────────────────────────

const NeoTriggerInputSchema = z.object({
  fileName: z.string().min(1).max(260),
  analysis: z.discriminatedUnion('kind', [
    z.object({
      kind:             z.literal('csv'),
      rowCount:         z.number().int().nonnegative(),
      columnNames:      z.array(z.string()).max(200),
      amountColumnName: z.string().nullable(),
      amountTotal:      z.number().nullable(),
      amountTotalNote:  z.string().nullable(),
    }),
    z.object({
      kind:       z.literal('excel'),
      sheetNames: z.array(z.string()).max(50),
      sheetCount: z.number().int().nonnegative(),
    }),
    z.object({
      kind:    z.literal('pdf'),
      sizeKb:  z.number().nonnegative(),
    }),
    z.object({
      kind:     z.literal('image'),
      mimeType: z.string(),
      sizeKb:   z.number().nonnegative(),
    }),
    z.object({
      kind:     z.literal('unknown'),
      mimeType: z.string(),
    }),
  ]),
  /** Drive アップロードに成功した場合の fileId（省略可） */
  driveFileId:   z.string().optional(),
  driveWebLink:  z.string().url().optional(),
});

export type NeoTriggerInput  = z.infer<typeof NeoTriggerInputSchema>;

// ─── 出力型 ─────────────────────────────────────────────────────

export interface NeoTriggerResult {
  ok:       boolean;
  /** Soul 処理済みの Neo 第一声テキスト */
  message?: string;
  error?:   string;
  code?:    string;
}

// ─── Server Action ───────────────────────────────────────────────

/**
 * ファイル解析結果を受け取り、Soul Pipeline を通した Neo の第一声を返す。
 *
 * 呼び出しタイミング:
 *   1. ドロップ直後に analyzeFile() でクライアント解析
 *   2. Drive アップロード完了後（または解析のみでも可）にこの Action を呼ぶ
 *   3. 返ってきた message をデスクの Neo チャットエリアに表示
 */
export async function generateNeoFirstMessage(
  rawInput: unknown,
): Promise<NeoTriggerResult> {
  try {
    // ① 認証
    const user = await requireAuth();

    // ② レート制限（Drive Soul メッセージのプリセットを流用）
    await checkRateLimit(`desk:neo-trigger:${user.id}`, RATE_LIMIT_PRESETS.driveSoulMessage);

    // ③ Zod バリデーション
    const parsed = NeoTriggerInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors[0]?.message ?? '入力が正しくありません';
      const soul = await loadSoulServer(user.id);
      const fallback = await runSoulPipeline({
        raw:          `うまく読み込めなかったみたい。${errorMsg}`,
        userId:       user.id,
        soulOverride: soul,
        context:      { alertLevel: 'warn' },
      });
      return { ok: false, message: fallback.text, error: errorMsg, code: 'VALIDATION_ERROR' };
    }

    const { fileName, analysis } = parsed.data;

    // ④ Soul ロード（5分キャッシュ）
    const soul = await loadSoulServer(user.id);

    // ⑤ 解析種別ごとに raw テンプレートを生成
    const raw = _buildRawTemplate(fileName, analysis);

    // ⑥ Soul Pipeline（文字列直返し禁止）
    const soulResult = await runSoulPipeline({
      raw,
      userId:       user.id,
      soulOverride: soul,
      context: {
        // ファイルドロップは新規エントリに相当 → 励ましをやや促進
        todayEntryCount: 1,
      },
    });

    return { ok: true, message: soulResult.text };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    // エラー時も Soul Pipeline でラップ（handleServerActionError では cold なメッセージになるので専用処理）
    try {
      const user2 = await getAuthenticatedUser();
      if (user2) {
        const soul = await loadSoulServer(user2.id);
        const fallback = await runSoulPipeline({
          raw:          'うまく読み込めなかったみたい😢 もう一度試してみて。',
          userId:       user2.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return { ok: false, message: fallback.text, code: 'INTERNAL_ERROR' };
      }
    } catch {
      // 認証エラーなど
    }
    return handleServerActionError(err);
  }
}

// ─── rawテンプレート生成（純粋関数） ─────────────────────────────

/**
 * ファイル解析結果からSoul Pipelineへ渡す「素のテンプレート」を生成する。
 * この段階では文体・ペルソナは一切考慮しない。Soul が整える。
 *
 * ⚠️ テンプレートに禁止フレーズ（「もちろん」など）を入れると
 *    Soul Pipeline の Step 1 で削除されることに注意。
 */
function _buildRawTemplate(
  fileName: string,
  analysis: FileAnalysisResult,
): string {
  // ファイル名をサニタイズ（最大60文字）
  const name = _truncate(fileName, 60);

  switch (analysis.kind) {
    case 'csv': {
      const { rowCount, columnNames, amountColumnName, amountTotal, amountTotalNote } = analysis;
      const colPreview = columnNames.slice(0, 5).join('・');
      const hasMore    = columnNames.length > 5 ? `ほか${columnNames.length - 5}列` : '';

      // 金額サマリー
      let amountLine = '';
      if (amountColumnName !== null && amountTotal !== null) {
        const formatted = amountTotal.toLocaleString('ja-JP');
        amountLine = `「${amountColumnName}」列の合計は¥${formatted}だね。${amountTotalNote ? `（${amountTotalNote}）` : ''}`;
      } else if (amountTotalNote) {
        amountLine = amountTotalNote;
      }

      return [
        `${name}読み込めたよ🎵`,
        `${rowCount}件のデータがあるね。列は${colPreview}${hasMore ? `（${hasMore}）` : ''}。`,
        amountLine ? amountLine : '',
        '仕訳から始める？それとも月次サマリー見る？',
      ].filter(Boolean).join(' ');
    }

    case 'excel': {
      const { sheetNames, sheetCount } = analysis;
      if (sheetCount === 0) {
        return `${name}は開けたけど、シートが見つからなかった。ファイルの中身を確認してみて。`;
      }
      const sheetList = sheetNames.slice(0, 4).map((s) => `「${s}」`).join('・');
      const hasMore   = sheetCount > 4 ? `ほか${sheetCount - 4}シート` : '';
      return `${name}、${sheetCount}シートあるね。${sheetList}${hasMore ? `（${hasMore}）` : ''}。どのシートから作業しようか？`;
    }

    case 'pdf':
      return `読み取ってみるね、少し待って🎵（${analysis.sizeKb}KB）`;

    case 'image':
      return '読み取ってみるね、少し待って🎵';

    case 'unknown':
    default:
      return 'うまく読み込めなかった😢 もう一度試してみて。';
  }
}

function _truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max) + '…';
}
