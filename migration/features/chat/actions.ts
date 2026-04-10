/**
 * features/chat/actions.ts
 * Server Actions — AI チャット（handleInstruction）
 *
 * 必須ルール:
 *   - Gemini 呼び出しは lib/gemini-soul-bridge の executeGeminiWithMandatorySoulPipeline を経由する
 *   - 生の rawReply を返さない（Soul Pipeline 適用済みテキストのみ）
 *
 * ─── Agentic Loop（ReAct 風・軽量）────────────────────────────────────
 * 1. Goal   — ユーザーの意図を <goal> に（任意）
 * 2. Plan   — <plan> に短い手順（任意）
 * 3. Tools  — <actions> に JSON（INSERT_ACTIVITY 等）。autoExecute は常に false 扱い
 * 4. Reply  — <reply> にユーザー向け本文（Soul 済みで返却）
 * 5. Confirm— クライアントが pendingActions を保持し、「実行して」まで待機
 * 6. Execute— pendingActionsToConfirm + HMAC（pendingApprovalToken 等）+ nonce DB + 承認ワード
 *    が揃ったときだけ DB 実行（insertActivity 等）。成功後は loopPhase: 'executed'。
 *
 * 提案のみのターン（Neo 主導・意図がまだ曖昧なとき）:
 *   <goal> / <plan> / Soul 済み <reply> のみで「この流れで進めてよいか」を返し、<actions> は付けない。
 *   awaitingConfirmation は立たず、AgenticPendingPanel は表示しない（登録案がまだないため）。
 *   agent.goalSummary / planSummary はクライアントが ChatMessage に埋め込み、MessageBubble でカード表示する。
 *
 * Drive 記帳（Zero-Server）:
 *   ファイル実体はチャット上の Drive フォーム → バナー「記帳する」で確定。
 *   本ループの <actions> は主に「金額だけの登録」向け。領収書ファイルは Drive 経路と二重にならないよう
 *   システムプロンプトで Neo に案内させる。
 */

'use server';

import { randomUUID } from 'crypto';
import type { User } from '@supabase/supabase-js';
import {
  requireAuth,
  handleServerActionError,
  isNextRedirectError,
} from '@/lib/supabase/server';
import {
  HandleInstructionSchema,
  ActivityInsertSchema,
  formatZodError,
} from '@/lib/validation';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { loadSoulServer } from '@/features/soul/server';
import { finalizeAssistantReplyAfterGemini, runSoulPipeline } from '@/lib/soul-pipeline';
import {
  executeGeminiWithMandatorySoulPipeline,
  type GeminiCallResult,
} from '@/lib/gemini-soul-bridge';
import {
  GeminiEnvConfigurationError,
  getGeminiApiKey,
  resolveGeminiApiKeyWithSource,
} from '@/lib/gemini-env';
import { isConfirmExecutionMessage } from '@/lib/agent-chat-confirm';
import { buildSystemPrompt } from '@/features/chat/soul-prompt';
import { fetchActivities, insertActivity } from '@/features/activities/actions';
import { parseAgenticGeminiResponse } from '@/lib/agentic-parser';
import { resolveLoopPhaseForReply } from '@/lib/agentic-phase';
import {
  getAgenticPendingTtlMs,
  signPendingActionsApproval,
  verifyPendingActionsApproval,
} from '@/lib/agentic-pending-signing';
import {
  claimAgenticPendingNonce,
  registerAgenticPendingNonce,
  releaseAgenticPendingNonce,
} from '@/lib/agentic-pending-nonces';
import type {
  ParsedAction,
  HandleInstructionAgentMeta,
  AgenticLoopPhase,
} from '@/lib/agentic-types';
import type { ChatMessage, HandleInstructionResult } from './chat-types';

type GeminiPipelineMeta = {
  parsed: ReturnType<typeof parseAgenticGeminiResponse>;
};

// ─── メイン Server Action ─────────────────────────────────────────

export async function handleInstruction(
  rawInput: unknown,
): Promise<HandleInstructionResult> {
  try {
    const user = await requireAuth();
    if (process.env.NODE_ENV === 'development') {
      const g = process.env.GEMINI_API_KEY;
      console.log(
        'Using API Key:',
        g && g.length > 0 ? `${g.slice(0, 5)}...` : '(GEMINI_API_KEY unset — may use GOOGLE_* fallback)',
      );
      const r = resolveGeminiApiKeyWithSource();
      console.log('[handleInstruction] resolved key:', {
        source: r.source,
        length: r.key?.length ?? 0,
      });
    }
    await checkRateLimit(`chat:${user.id}`, RATE_LIMIT_PRESETS.chat);

    const parsed = HandleInstructionSchema.safeParse(rawInput);
    if (!parsed.success) {
      const soul = await runSoulPipeline({
        raw:     `入力内容を一度確認してほしいな。${formatZodError(parsed.error)}`,
        userId:  user.id,
        context: { alertLevel: 'warn' },
      });
      return { ok: false, error: soul.text, code: 'VALIDATION_ERROR' };
    }
    const {
      message,
      history,
      pendingActionsToConfirm,
      pendingApprovalToken,
      pendingApprovalNonce,
      pendingApprovalIssuedAt,
    } = parsed.data;

    const confirmMsg = _isConfirmExecutionMessage(message);

    // ─ 確認フロー: 保留アクションの実行（Gemini を呼ばない） ─────
    if (pendingActionsToConfirm?.length && confirmMsg) {
      await checkRateLimit(
        `chat:agentic-confirm:${user.id}`,
        RATE_LIMIT_PRESETS.chatAgenticConfirm,
      );
      const soul    = await loadSoulServer(user.id);
      const actions = pendingActionsToConfirm as ParsedAction[];

      if (!_allPendingAreInsertActivities(actions)) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            'この種類の登録案は、チャットから一括実行できないみたい。内容を分けて、もう一度 Neo に相談してみて。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'INVALID_PENDING_ACTION_TYPES',
        };
      }

      const tok      = pendingApprovalToken!;
      const nonce    = pendingApprovalNonce!;
      const issuedAt = pendingApprovalIssuedAt!;

      if (
        !verifyPendingActionsApproval(user.id, actions, issuedAt, nonce, tok)
      ) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            '承認情報が一致しなかったみたい。もう一度チャットから登録案を出してもらえれば大丈夫。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'INVALID_PENDING_SIGNATURE',
        };
      }

      const ttl = getAgenticPendingTtlMs();
      if (Date.now() - issuedAt > ttl) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            '承認の有効時間が切れたみたい。もう一度チャットから登録案を出してもらえる？',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'PENDING_EXPIRED',
        };
      }

      const claim = await claimAgenticPendingNonce(user.id, nonce);
      if (!claim.ok || !claim.rowId) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            'この承認はすでに使われたか、有効期限が切れているみたい。新しい登録案を出してもらえる？',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'PENDING_ALREADY_USED',
        };
      }

      try {
        const out = await _executeConfirmedPendingActions(user, soul, actions);
        if (!out.ok) {
          await releaseAgenticPendingNonce(user.id, claim.rowId);
        }
        return out;
      } catch (err) {
        await releaseAgenticPendingNonce(user.id, claim.rowId);
        throw err;
      }
    }

    const [soul, recentActivities] = await Promise.all([
      loadSoulServer(user.id),
      fetchActivities({ limit: 10 }),
    ]);

    const systemPrompt = buildSystemPrompt(soul, recentActivities);

    const pipelineResult = await executeGeminiWithMandatorySoulPipeline<GeminiPipelineMeta>(
      { userId: user.id, soulOverride: soul },
      () => _callGemini({ systemPrompt, history, message }),
      async (rawGeminiText) => {
        const parsed = parseAgenticGeminiResponse(rawGeminiText);
        return {
          soulInput: {
            raw:          parsed.rawReply,
            userId:       user.id,
            soulOverride: soul,
            context: {
              todayEntryCount:     recentActivities.length,
              lastEncouragementAt: 0,
              activityCategory:    _extractCategory(parsed.actions),
              forceTaxDisclaimer:  _hasTaxKeyword(parsed.rawReply),
            },
          },
          meta: { parsed },
        };
      },
    );

    if (!pipelineResult.ok) {
      return {
        ok:    false,
        error: pipelineResult.error,
        code:  'AI_ERROR',
        _debug:
          process.env.NODE_ENV === 'development'
            ? {
                soulDebug:           pipelineResult.soulDebug,
                geminiTechnicalError:
                  pipelineResult.technicalGeminiError ?? null,
                aiHint:
                  pipelineResult.technicalGeminiError?.startsWith('[neo:ai-config]')
                    ? 'config / API key'
                    : /model|404|400|not found/i.test(
                          String(pipelineResult.technicalGeminiError),
                        )
                      ? 'model / API request'
                      : 'other',
              }
            : undefined,
      };
    }

    const { parsed: parsedSeg } = pipelineResult.meta;
    const pendingNeedsConfirm = parsedSeg.actions.filter((a) => !(a.autoExecute ?? false));
    const loopPhase: AgenticLoopPhase = resolveLoopPhaseForReply(parsedSeg);
    // goal/plan は常に agent に載せる（クライアントが ChatMessage に埋め込み、提案のみでも履歴に残す）
    const goalSummary = parsedSeg.goal?.trim() || undefined;
    const planSummary = parsedSeg.planSummary?.trim() || undefined;

    const actionsForClient =
      pendingNeedsConfirm.length > 0 ? pendingNeedsConfirm : parsedSeg.actions;

    const baseAgent: HandleInstructionAgentMeta = {
      loopPhase,
      goalSummary,
      planSummary,
      phase:                'reply',
      awaitingConfirmation: pendingNeedsConfirm.length > 0,
      pendingActionCount:   pendingNeedsConfirm.length,
    };

    if (pendingNeedsConfirm.length > 0) {
      const nonce    = randomUUID();
      const issuedAt = Date.now();
      const ttlMs    = getAgenticPendingTtlMs();
      const token    = signPendingActionsApproval(
        user.id,
        pendingNeedsConfirm,
        issuedAt,
        nonce,
      );

      const reg = await registerAgenticPendingNonce(
        user.id,
        nonce,
        issuedAt + ttlMs,
      );

      if (!reg.ok) {
        return {
          ok:    true,
          reply: pipelineResult.soulText,
          actions: [],
          agent: {
            ...baseAgent,
            awaitingConfirmation: false,
            pendingActionCount:   0,
          },
          _debug:
            process.env.NODE_ENV === 'development'
              ? {
                  ...pipelineResult.soulDebug,
                  agenticNonceRegisterFailed: true,
                }
              : undefined,
        };
      }

      return {
        ok:    true,
        reply: pipelineResult.soulText,
        actions: actionsForClient,
        agent: {
          ...baseAgent,
          pendingApprovalToken:    token,
          pendingApprovalNonce:    nonce,
          pendingApprovalIssuedAt:   issuedAt,
        },
        _debug:
          process.env.NODE_ENV === 'development'
            ? {
                ...pipelineResult.soulDebug,
                agenticParse: {
                  hasGoal:              Boolean(goalSummary),
                  hasPlan:              Boolean(planSummary),
                  actionCount:          parsedSeg.actions.length,
                  awaitingConfirmation: true,
                },
              }
            : undefined,
      };
    }

    return {
      ok:    true,
      reply: pipelineResult.soulText,
      actions: actionsForClient,
      agent:   baseAgent,
      _debug:
        process.env.NODE_ENV === 'development'
          ? {
              ...pipelineResult.soulDebug,
              agenticParse: {
                hasGoal:              Boolean(goalSummary),
                hasPlan:              Boolean(planSummary),
                actionCount:          parsedSeg.actions.length,
                awaitingConfirmation: false,
              },
            }
          : undefined,
    };
  } catch (err) {
    if (isNextRedirectError(err)) throw err;
    return handleServerActionError(err);
  }
}

// ─── 保留アクション実行（INSERT のみ本実装） ─────────────────────

async function _executeConfirmedPendingActions(
  user: User,
  soul: Awaited<ReturnType<typeof loadSoulServer>>,
  pending: ParsedAction[],
): Promise<HandleInstructionResult> {
  const lines: string[] = [];

  for (const action of pending) {
    if (action.type === 'INSERT_ACTIVITY') {
      const ins = ActivityInsertSchema.safeParse(action.payload);
      if (!ins.success) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            '入力内容を確認できませんでした。もう一度、金額と日付をはっきりさせてください。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'VALIDATION_ERROR',
          agent: {
            loopPhase:            'awaiting_confirm',
            phase:                'reply',
            awaitingConfirmation: true,
          },
        };
      }
      const r = await insertActivity(ins.data);
      if (!r.ok) {
        // insertActivity 側で DB 失敗時は既に runSoulPipeline 済みの error を返す
        return {
          ok:    false,
          error: r.error ?? '登録に失敗しました。',
          code:  r.code ?? 'DB_ERROR',
          agent: {
            loopPhase:            'awaiting_confirm',
            phase:                'reply',
            awaitingConfirmation: true,
          },
        };
      }
      lines.push(r.message ?? '記録しました。');
    }
  }

  if (lines.length === 0) {
    const merged = await finalizeAssistantReplyAfterGemini({
      raw:          '実行できる保留アクションがありませんでした。',
      userId:       user.id,
      soulOverride: soul,
      context:      { alertLevel: 'warn' },
    });
    return {
      ok:    true,
      reply: merged.text,
      agent: {
        loopPhase:            'executed',
        phase:                'confirm_executed',
        awaitingConfirmation: false,
      },
    };
  }

  const merged = await finalizeAssistantReplyAfterGemini({
    raw:          lines.join('\n'),
    userId:       user.id,
    soulOverride: soul,
    context:      { todayEntryCount: 1 },
  });

  return {
    ok:    true,
    reply: merged.text,
    agent: {
      loopPhase:            'executed',
      phase:                'confirm_executed',
      awaitingConfirmation: false,
    },
    _debug: process.env.NODE_ENV === 'development' ? merged.debug : undefined,
  };
}

// ─── Gemini API クライアント ─────────────────────────────────────

interface GeminiCallInput {
  systemPrompt: string;
  history:      ChatMessage[];
  message:      string;
}

async function _callGemini(input: GeminiCallInput): Promise<GeminiCallResult> {
  let apiKey: string;
  let source: ReturnType<typeof resolveGeminiApiKeyWithSource>['source'];
  try {
    apiKey = getGeminiApiKey();
    source = resolveGeminiApiKeyWithSource().source;
  } catch (e) {
    if (e instanceof GeminiEnvConfigurationError) {
      console.error('[handleInstruction] Gemini env:', e.message);
      return {
        ok:      false,
        error:   '[neo:ai-config] API key missing',
        variant: 'config',
      };
    }
    throw e;
  }
  if (process.env.NODE_ENV === 'development') {
    console.info(
      `[handleInstruction] Gemini request — envKey=${source} keyLength=${apiKey.length}`,
    );
  }

  const contents = [
    ...input.history.map((m) => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: input.message }] },
  ];

  const primaryModel =
    process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
  const fallbackModel =
    process.env.GEMINI_MODEL_FALLBACK?.trim() || 'gemini-1.5-flash';

  const requestBody = {
    system_instruction: { parts: [{ text: input.systemPrompt }] },
    contents,
    generationConfig: {
      temperature:      0.7,
      maxOutputTokens:  1536,
      responseMimeType: 'text/plain' as const,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  async function geminiGenerateOnce(
    modelId: string,
  ): Promise<GeminiCallResult> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(requestBody),
          cache:   'no-store',
          signal:  AbortSignal.timeout(30_000),
        },
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => 'unknown');
        console.error(
          '[handleInstruction] Gemini API error:',
          modelId,
          res.status,
          errBody.slice(0, 600),
        );
        if (res.status === 401 || res.status === 403) {
          return {
            ok:         false,
            error:      '[neo:ai-config] API rejected the key (401/403)',
            variant:    'config',
            httpStatus: res.status,
          };
        }
        return {
          ok:         false,
          error:      `[neo:gemini-http] model=${modelId} status=${res.status} body=${errBody.slice(0, 280)}`,
          variant:    'generic',
          httpStatus: res.status,
        };
      }

      const json = await res.json();
      const finishReason = json?.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        return {
          ok:      false,
          error:   '安全フィルタにより応答がブロックされました',
          variant: 'safety',
        };
      }

      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!text) {
        return {
          ok:      false,
          error:   'AI から空の応答が返されました',
          variant: 'empty',
        };
      }

      return { ok: true, text };
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        return {
          ok:      false,
          error:   'AI の応答がタイムアウトしました（30秒）',
          variant: 'timeout',
        };
      }
      console.error('[handleInstruction] Fetch error:', modelId, err);
      return {
        ok:      false,
        error:   'ネットワークエラーが発生しました',
        variant: 'network',
      };
    }
  }

  let result = await geminiGenerateOnce(primaryModel);

  const canTryModelFallback =
    !result.ok &&
    result.variant !== 'config' &&
    typeof result.httpStatus === 'number' &&
    result.httpStatus !== 401 &&
    result.httpStatus !== 403 &&
    fallbackModel !== primaryModel;

  if (canTryModelFallback) {
    if (process.env.NODE_ENV === 'development') {
      const httpSt = result.ok === false ? result.httpStatus : undefined;
      console.warn('[handleInstruction] Gemini model fallback', {
        from: primaryModel,
        to:   fallbackModel,
        httpStatus: httpSt,
      });
    }
    result = await geminiGenerateOnce(fallbackModel);
  }

  return result;
}

function _extractCategory(actions: ParsedAction[]): string | undefined {
  const insertAction = actions.find(
    (a) => a.type === 'INSERT_ACTIVITY' && typeof a.payload.category === 'string',
  );
  return insertAction?.payload.category as string | undefined;
}

const TAX_KEYWORDS = ['消費税', '所得税', '確定申告', '経費', '控除', '源泉', '損金', '益金'];
function _hasTaxKeyword(text: string): boolean {
  return TAX_KEYWORDS.some((k) => text.includes(k));
}

function _isConfirmExecutionMessage(message: string): boolean {
  return isConfirmExecutionMessage(message);
}

/** チャット経由の一括実行は INSERT_ACTIVITY のみ（他タイプはサーバーが別経路） */
function _allPendingAreInsertActivities(actions: ParsedAction[]): boolean {
  return (
    actions.length > 0 &&
    actions.every((a) => a.type === 'INSERT_ACTIVITY')
  );
}
