/**
 * lib/gemini-soul-bridge.ts
 *
 * 「Gemini を呼ぶ処理は必ず Soul Pipeline を通す」をコードで強制するためのブリッジ。
 * 新規 Server Action で generateContent / Gemini API を使う場合は、
 * **executeGeminiWithMandatorySoulPipeline** を経由すること（eslint コメント・レビュー観点）。
 *
 * @see MIGRATION_GUIDE.md — Soul Pipeline 適用チェックリスト
 */

import type { NeoSoul } from '@/features/soul/server';
import {
  finalizeAssistantReplyAfterGemini,
  runSoulPipelineForAiFailure,
  type AiFailureVariant,
  type SoulPipelineInput,
  type SoulPipelineOutput,
} from '@/lib/soul-pipeline';

// ─── 型 ──────────────────────────────────────────────────────────

/** Gemini 呼び出しの結果（生テキスト or 技術エラー文言） */
export type GeminiCallResult =
  | { ok: true; text: string }
  | {
      ok:          false;
      error:       string;
      variant?:    AiFailureVariant;
      /** モデルフォールバック判定用（任意） */
      httpStatus?: number;
    };

export type GeminiSoulSuccess<TMeta> = {
  ok:               true;
  soulText:         string;
  rawGemini:        string;
  soulDebug:        SoulPipelineOutput['debug'];
  meta:             TMeta;
};

export type GeminiSoulFailure = {
  ok:        false;
  error:     string;
  soulDebug: SoulPipelineOutput['debug'];
  code:      'AI_ERROR';
  /** 開発者向け: Soul 適用前の Gemini 生エラー文言 */
  technicalGeminiError?: string;
};

// ─── 技術エラー → Soul 失敗バリアント（一元化） ───────────────────

export function mapTechnicalErrorToAiFailureVariant(error?: string): AiFailureVariant {
  if (!error) return 'generic';
  // Avoid matching any string containing 「設定」— too many false positives vs Soul text.
  if (error.startsWith('[neo:ai-config]')) return 'config';
  if (error.includes('タイムアウト')) return 'timeout';
  if (error.includes('ネットワーク')) return 'network';
  if (error.includes('安全フィルタ')) return 'safety';
  if (error.includes('空の応答')) return 'empty';
  return 'generic';
}

/**
 * Gemini の成否に関わらず、**成功時は finalize / 失敗時は runSoulPipelineForAiFailure** を通す。
 *
 * @param ctx          userId + 既にロード済みの Soul（DB 再取得を避ける）
 * @param geminiCall   fetch generateContent 等（戻り値は GeminiCallResult に正規化すること）
 * @param onSuccess    生テキストを受け取り、SoulPipelineInput と任意メタを返す
 */
export async function executeGeminiWithMandatorySoulPipeline<TMeta>(
  ctx: {
    userId:        string;
    soulOverride?: NeoSoul;
  },
  geminiCall: () => Promise<GeminiCallResult>,
  onSuccess: (
    rawGeminiText: string,
  ) => Promise<{ soulInput: SoulPipelineInput; meta: TMeta }>,
): Promise<GeminiSoulSuccess<TMeta> | GeminiSoulFailure> {
  const geminiResult = await geminiCall();

  if (!geminiResult.ok) {
    const variant =
      geminiResult.variant ??
      mapTechnicalErrorToAiFailureVariant(geminiResult.error);
    const soul = await runSoulPipelineForAiFailure({
      userId:       ctx.userId,
      soulOverride: ctx.soulOverride,
      variant,
    });
    return {
      ok:        false,
      error:     soul.text,
      soulDebug: soul.debug,
      code:      'AI_ERROR',
      technicalGeminiError:
        process.env.NODE_ENV === 'development' ? geminiResult.error : undefined,
    };
  }

  const { soulInput, meta } = await onSuccess(geminiResult.text);
  const soul = await finalizeAssistantReplyAfterGemini(soulInput);

  return {
    ok:        true,
    soulText:  soul.text,
    rawGemini: geminiResult.text,
    soulDebug: soul.debug,
    meta,
  };
}

/**
 * レビュー用: この文字列を grep して「Gemini 直書きがないか」確認する。
 * （generateContent を直に呼ぶファイルは bridge を import しているか）
 */
export const GEMINI_SOUL_PIPELINE_ENFORCED_MARKER = 'executeGeminiWithMandatorySoulPipeline';
