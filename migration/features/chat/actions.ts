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

import { revalidatePath } from 'next/cache';
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
  AgenticProjectInsertSchema,
  formatZodError,
  isValidUuidString,
} from '@/lib/validation';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { loadSoulServer } from '@/features/soul/server';
import { finalizeAssistantReplyAfterGemini, runSoulPipeline } from '@/lib/soul-pipeline';
import {
  executeGeminiWithMandatorySoulPipeline,
  type GeminiCallResult,
} from '@/lib/gemini-soul-bridge';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_3_FLASH_ALIAS_PREVIEW,
  GeminiEnvConfigurationError,
  getGeminiApiKey,
  resolveGeminiApiKeyWithSource,
  resolveGeminiApiVersion,
  resolveGeminiModel,
  resolveGeminiModelFallback,
} from '@/lib/gemini-env';
import { isConfirmExecutionMessage } from '@/lib/agent-chat-confirm';
import { buildSystemPrompt } from '@/features/chat/soul-prompt';
import { fetchActivities, insertActivity } from '@/features/activities/actions';
import { insertProject } from '@/features/projects/actions';
import {
  parseInputToData,
  type AgenticParseResult,
} from '@/lib/agentic-parser';
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
import { isAgenticNonceDevBypassEnabled } from '@/lib/agentic-dev-bypass';
import type {
  ParsedAction,
  HandleInstructionAgentMeta,
  AgenticLoopPhase,
} from '@/lib/agentic-types';
import type { ChatMessage, HandleInstructionResult } from './chat-types';

function _revalidateCockpitAndProjectsAfterAgenticWrite(projectId?: string): void {
  // 'layout' 型: 指定パス以下のすべてのページ（/projects/[id] 含む）を無効化する。
  // デフォルト 'page' は /projects 一覧のみで、詳細ページには到達しない。
  revalidatePath('/', 'layout');
  revalidatePath('/cockpit', 'layout');
  revalidatePath('/projects', 'layout');
  // 特定のプロジェクト詳細ページを確実に無効化（最優先）
  if (projectId && isValidUuidString(projectId)) {
    revalidatePath(`/projects/${projectId}`, 'layout');
  }
}

type GeminiPipelineMeta = {
  parsed: AgenticParseResult;
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
      pendingApprovalDevBypass,
    } = parsed.data;

    const confirmMsg = _isConfirmExecutionMessage(message);

    // ─ Ledger / 書類ショートカット（Gemini 省略・router.push 可） ─
    if (
      !pendingActionsToConfirm?.length &&
      !confirmMsg &&
      _wantsLedgerDeskNavigation(message)
    ) {
      const soul = await loadSoulServer(user.id);
      const merged = await finalizeAssistantReplyAfterGemini({
        raw:
          'Ledger Desk を開いて、請求書や見書の作成に進みますね。',
        userId:       user.id,
        soulOverride: soul,
        context:      { todayEntryCount: 0 },
      });
      return {
        ok:    true,
        reply: merged.text,
        agent: {
          loopPhase:            'conversational',
          phase:                'reply',
          awaitingConfirmation: false,
        },
        clientNavigation: {
          href:   '/accounting-desk',
          reason: 'ledger_document_intent',
        },
        _debug:
          process.env.NODE_ENV === 'development' ? merged.debug : undefined,
      };
    }

    // ─ 確認フロー: 保留アクションの実行（Gemini を呼ばない） ─────
    if (pendingActionsToConfirm?.length && confirmMsg) {
      await checkRateLimit(
        `chat:agentic-confirm:${user.id}`,
        RATE_LIMIT_PRESETS.chatAgenticConfirm,
      );
      const soul    = await loadSoulServer(user.id);
      const actions = pendingActionsToConfirm as ParsedAction[];

      if (!_pendingIsOnlyProjectAndActivities(actions)) {
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

      // ─ Nonce クレーム ─────────────────────────────────────────────
      // Dev bypass: Turn 1 で agentic_pending_nonces テーブルへの insert が失敗し
      // nonce が DB に登録されていない場合、claim も必ず失敗する。
      // このときは HMAC + TTL のみで保護し、claim をスキップする。
      // （production では pendingApprovalDevBypass は常に false なので到達しない）
      let claimRowId: string | null = null;

      if (pendingApprovalDevBypass) {
        console.warn(
          '[agentic] dev bypass: skipping claimAgenticPendingNonce — ' +
          'nonce was never registered (agentic_pending_nonces table missing or RLS error). ' +
          'HMAC + TTL verification still applies. Run Supabase migration to enable full replay protection.',
        );
      } else {
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
        claimRowId = claim.rowId;
      }

      try {
        const out = await _executeConfirmedPendingActions(user, soul, actions);
        if (!out.ok && claimRowId) {
          await releaseAgenticPendingNonce(user.id, claimRowId);
        }
        return out;
      } catch (err) {
        if (claimRowId) await releaseAgenticPendingNonce(user.id, claimRowId);
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
        const parsed = parseInputToData(rawGeminiText);
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
    // goal/plan は常に agent に載せる（クライアントが ChatMessage に埋め込み、提案のみでも履歴に残す）
    const goalSummary = parsedSeg.goal?.trim() || undefined;
    const planSummary = parsedSeg.planSummary?.trim() || undefined;

    let actionsForSigning: ParsedAction[] = pendingNeedsConfirm;
    let eagerLastProjectId: string | null = null;
    if (
      pendingNeedsConfirm.length > 0 &&
      pendingNeedsConfirm.some((a) => a.type === 'INSERT_PROJECT')
    ) {
      const eager = await _materializePendingAfterEagerProjects(
        user,
        soul,
        pendingNeedsConfirm,
      );
      if (!eager.ok) return eager.result;
      actionsForSigning  = eager.materialized;
      eagerLastProjectId = eager.lastProjectId;
      console.log('[agentic] handleInstruction eager done — eagerLastProjectId=', eagerLastProjectId, 'actionsForSigning=', actionsForSigning.length);
    }

    const awaiting = actionsForSigning.length > 0;
    const loopPhase: AgenticLoopPhase = awaiting
      ? resolveLoopPhaseForReply(parsedSeg)
      : pendingNeedsConfirm.length > 0
        ? 'executed'
        : resolveLoopPhaseForReply(parsedSeg);

    const actionsForClient =
      pendingNeedsConfirm.length === 0 ? parsedSeg.actions : actionsForSigning;

    const baseAgent: HandleInstructionAgentMeta = {
      loopPhase,
      goalSummary,
      planSummary,
      phase:                awaiting
        ? 'reply'
        : pendingNeedsConfirm.length > 0
          ? 'confirm_executed'
          : 'reply',
      awaitingConfirmation: awaiting,
      pendingActionCount:   actionsForSigning.length,
    };

    if (actionsForSigning.length > 0) {
      const nonce    = randomUUID();
      const issuedAt = Date.now();
      const ttlMs    = getAgenticPendingTtlMs();
      const token    = signPendingActionsApproval(
        user.id,
        actionsForSigning,
        issuedAt,
        nonce,
      );

      let reg = await registerAgenticPendingNonce(
        user.id,
        nonce,
        issuedAt + ttlMs,
      );
      for (let attempt = 1; !reg.ok && attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 100 * attempt));
        reg = await registerAgenticPendingNonce(
          user.id,
          nonce,
          issuedAt + ttlMs,
        );
      }

      if (!reg.ok) {
        if (isAgenticNonceDevBypassEnabled()) {
          console.warn(
            '[agentic] dev bypass: registerAgenticPendingNonce failed; continuing without DB nonce row:',
            reg.error,
          );
          return {
            ok: true,
            reply: pipelineResult.soulText,
            actions: actionsForClient,
            agent: {
              ...baseAgent,
              pendingApprovalToken: token,
              pendingApprovalNonce:     nonce,
              pendingApprovalIssuedAt:  issuedAt,
              pendingApprovalDevBypass: true,
            },
            executedProjectId:
              eagerLastProjectId && isValidUuidString(eagerLastProjectId)
                ? eagerLastProjectId
                : undefined,
            _debug:
              process.env.NODE_ENV === 'development'
                ? {
                    ...pipelineResult.soulDebug,
                    agenticNonceRegisterDevBypass: true,
                    agenticNonceRegisterError:     reg.error ?? null,
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

        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            '登録の準備に失敗しました。少し待ってから、もう一度同じ内容で試してみてください。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'AGENTIC_NONCE_REGISTER_FAILED',
          _debug:
            process.env.NODE_ENV === 'development'
              ? {
                  ...pipelineResult.soulDebug,
                  agenticNonceRegisterFailed: true,
                  agenticNonceRegisterError:  reg.error ?? null,
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
        executedProjectId:
          eagerLastProjectId && isValidUuidString(eagerLastProjectId)
            ? eagerLastProjectId
            : undefined,
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

    // プロジェクトのみ（活動なし）で eager 実行済みの場合も executedProjectId を返す
    const nonAwaitingProjectId = eagerLastProjectId ?? undefined;
    if (nonAwaitingProjectId) {
      console.log('[agentic] handleInstruction non-awaiting path — executedProjectId=', nonAwaitingProjectId);
    }
    return {
      ok:    true,
      reply: pipelineResult.soulText,
      actions: actionsForClient,
      agent:   baseAgent,
      executedProjectId:     nonAwaitingProjectId,
      executedActivityCount: 0,
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

/**
 * 同一バッチで直近に作成したプロジェクト UUID を activity に付与する。
 * LLM が付けた project_id が UUID 形式でも、直前に insert したプロジェクト ID で必ず上書きする。
 */
function _injectActivityProjectIdFromLastProject(
  payload: Record<string, unknown>,
  lastProjectId: string | null,
): void {
  if (lastProjectId == null || !isValidUuidString(lastProjectId)) return;
  payload.project_id = lastProjectId;
}

/**
 * Gemini 1ターン目: INSERT_PROJECT を **この時点で** Supabase に入れ、承認用リストからは除く。
 * INSERT_ACTIVITY には直近で作成した project_id を注入する（既存値も上書き）。
 */
async function _materializePendingAfterEagerProjects(
  user: User,
  soul: Awaited<ReturnType<typeof loadSoulServer>>,
  pending: ParsedAction[],
): Promise<
  | {
      ok: true;
      materialized: ParsedAction[];
      lastProjectId: string | null;
      /** eager で INSERT_PROJECT した UUID（未作成なら null） */
      executedProjectId: string | null;
    }
  | { ok: false; result: HandleInstructionResult }
> {
  const ordered         = _sortCompoundPending(pending);
  let lastProjectId: string | null = null;
  const materialized: ParsedAction[] = [];

  for (const action of ordered) {
    if (action.type === 'INSERT_PROJECT') {
      const ins = AgenticProjectInsertSchema.safeParse(action.payload);
      if (!ins.success) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            'プロジェクト情報を確認できませんでした。名前をはっきりさせて、もう一度お試しください。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok: false,
          result: {
            ok:    false,
            error: merged.text,
            code:  'VALIDATION_ERROR',
          },
        };
      }
      const pr = await insertProject(ins.data);
      if (!pr.ok) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:          pr.error ?? 'プロジェクトの作成に失敗しました。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok: false,
          result: {
            ok:    false,
            error: merged.text,
            code:  pr.code ?? 'DB_ERROR',
          },
        };
      }
      if (!pr.id) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            'プロジェクトは作成できましたが、ID を取得できませんでした。もう一度お試しください。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok: false,
          result: {
            ok:    false,
            error: merged.text,
            code:  'PROJECT_ID_MISSING',
          },
        };
      }
      lastProjectId = pr.id;
      console.log('[agentic] INSERT_PROJECT eager → lastProjectId=', lastProjectId);
      continue;
    }

    if (action.type === 'INSERT_ACTIVITY') {
      const payload: Record<string, unknown> = {
        ...(action.payload as Record<string, unknown>),
      };
      _injectActivityProjectIdFromLastProject(payload, lastProjectId);
      if (lastProjectId) {
        console.log(
          `[agentic] project_id injected: ${lastProjectId} into activity (eager materialize)`,
        );
      }
      materialized.push({
        ...action,
        payload,
      });
    }
  }

  _revalidateCockpitAndProjectsAfterAgenticWrite(lastProjectId ?? undefined);
  console.log(
    '[agentic] _materializePendingAfterEagerProjects done — lastProjectId=',
    lastProjectId,
    'executedProjectId=',
    lastProjectId,
    'materialized=',
    materialized.length,
  );
  return {
    ok:                true,
    materialized,
    lastProjectId,
    executedProjectId: lastProjectId,
  };
}

// ─── 保留アクション実行（承認時は主に INSERT_ACTIVITY。INSERT_PROJECT は1ターン目で済） ─

async function _executeConfirmedPendingActions(
  user: User,
  soul: Awaited<ReturnType<typeof loadSoulServer>>,
  pending: ParsedAction[],
): Promise<HandleInstructionResult> {
  const ordered = _sortCompoundPending(pending);
  const lines: string[] = [];
  let lastProjectId: string | null = null;
  let createdProjectName: string | null = null;
  let activitySuccessCount = 0;
  const executedActivitySummaries: {
    label: string;
    amount: number;
    kind:   'expense' | 'income' | 'transfer';
  }[] = [];

  // eager materialize で INSERT_PROJECT がない場合（Turn 1 で処理済み）、
  // activities の payload 内 project_id から lastProjectId を補完する。
  // これにより final executedProjectId が正しく返る。
  if (!ordered.some((a) => a.type === 'INSERT_PROJECT')) {
    const firstActivityWithProject = ordered.find(
      (a) =>
        a.type === 'INSERT_ACTIVITY' &&
        typeof a.payload?.project_id === 'string' &&
        isValidUuidString(a.payload.project_id as string),
    );
    if (firstActivityWithProject) {
      lastProjectId = firstActivityWithProject.payload.project_id as string;
      console.log(
        '[agentic] _executeConfirmedPendingActions: lastProjectId restored from activity payload:',
        lastProjectId,
      );
    }
  }

  for (const action of ordered) {
    if (action.type === 'INSERT_PROJECT') {
      const ins = AgenticProjectInsertSchema.safeParse(action.payload);
      if (!ins.success) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            'プロジェクト情報を確認できませんでした。名前をはっきりさせて、もう一度お試しください。',
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
      const pr = await insertProject(ins.data);
      if (!pr.ok) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:          pr.error ?? 'プロジェクトの作成に失敗しました。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  pr.code ?? 'DB_ERROR',
          agent: {
            loopPhase:            'awaiting_confirm',
            phase:                'reply',
            awaitingConfirmation: true,
          },
        };
      }
      if (!pr.id) {
        const merged = await finalizeAssistantReplyAfterGemini({
          raw:
            'プロジェクトは作成できましたが、ID を取得できませんでした。もう一度お試しください。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  'PROJECT_ID_MISSING',
          agent: {
            loopPhase:            'awaiting_confirm',
            phase:                'reply',
            awaitingConfirmation: true,
          },
        };
      }
      lastProjectId = pr.id;
      createdProjectName = ins.data.name;
      lines.push(pr.message ?? `新規プロジェクト「${ins.data.name}」を作成しました。`);
      console.log('[agentic] INSERT_PROJECT confirm → lastProjectId=', lastProjectId);
      continue;
    }

    if (action.type === 'INSERT_ACTIVITY') {
      const payload: Record<string, unknown> = {
        ...(action.payload as Record<string, unknown>),
      };
      _injectActivityProjectIdFromLastProject(payload, lastProjectId);
      if (lastProjectId) {
        console.log(
          `[agentic] project_id injected: ${lastProjectId} into activity (confirm path)`,
        );
      }
      const ins = ActivityInsertSchema.safeParse(payload);
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
        const merged = await finalizeAssistantReplyAfterGemini({
          raw: '収支の登録に失敗しました。もう一度試してください。',
          userId:       user.id,
          soulOverride: soul,
          context:      { alertLevel: 'warn' },
        });
        return {
          ok:    false,
          error: merged.text,
          code:  r.code ?? 'DB_ERROR',
          agent: {
            loopPhase:            'awaiting_confirm',
            phase:                'reply',
            awaitingConfirmation: true,
          },
        };
      }
      activitySuccessCount += 1;
      const label =
        ins.data.title?.trim() ||
        ins.data.category?.trim() ||
        '項目';
      executedActivitySummaries.push({
        label,
        amount: ins.data.amount,
        kind:   ins.data.type,
      });
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

  let rawSummary = lines.join('\n');
  const docFollow =
    '\n\n請求書や見書を作成しますか？「請求書作って」と入力すると Ledger Desk（会計デスク）へ進めます。サイドバーの Ledger Desk からも書類の下書きに進められます。';
  if (createdProjectName != null && activitySuccessCount > 0) {
    const parts = executedActivitySummaries.map((row) => {
      const amt = _formatAmountForGuidanceJa(row.amount);
      return `${row.label}${amt}`;
    });
    const joined = _joinExpenseLabelsJa(parts);
    const allExpense = executedActivitySummaries.every((r) => r.kind === 'expense');
    const verb = allExpense ? 'を経として追加しました' : 'を記録しました';
    rawSummary += `\n\nプロジェクト「${createdProjectName}」を作成し、${joined}${verb}。${docFollow}`;
  } else if (createdProjectName != null && activitySuccessCount === 0) {
    rawSummary += `\n\nプロジェクト「${createdProjectName}」を作成しました。${docFollow}`;
  } else if (activitySuccessCount > 0) {
    const parts = executedActivitySummaries.map((row) => {
      const amt = _formatAmountForGuidanceJa(row.amount);
      return `${row.label}${amt}`;
    });
    const joined = _joinExpenseLabelsJa(parts);
    const allExpense = executedActivitySummaries.every((r) => r.kind === 'expense');
    const verb = allExpense ? 'を経として追加しました' : 'を記録しました';
    rawSummary += `\n\n${joined}${verb}。${docFollow}`;
  }

  const merged = await finalizeAssistantReplyAfterGemini({
    raw:          rawSummary,
    userId:       user.id,
    soulOverride: soul,
    context:      { todayEntryCount: Math.max(1, activitySuccessCount) },
  });

  const finalProjectId =
    lastProjectId && isValidUuidString(lastProjectId) ? lastProjectId : undefined;

  _revalidateCockpitAndProjectsAfterAgenticWrite(finalProjectId);

  const navigateToProjectDetail =
    Boolean(finalProjectId) && activitySuccessCount > 0;

  return {
    ok:                    true,
    reply:                 merged.text,
    executedProjectId:     finalProjectId,
    executedActivityCount: activitySuccessCount,
    ...(navigateToProjectDetail && finalProjectId
      ? {
          clientNavigation: {
            href:   `/projects/${finalProjectId}`,
            reason: 'agentic_project_with_activities',
          },
        }
      : {}),
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

  const primaryModel = resolveGeminiModel();
  const fallbackModel = resolveGeminiModelFallback();

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiRequestOptions = {
    timeout:     30_000,
    apiVersion:  resolveGeminiApiVersion(),
  } as const;

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category:  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category:  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category:  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  /** Agentic tags need plain text; JSON MIME would break parseInputToData. */
  const generationConfig = {
    temperature:      0.7,
    maxOutputTokens:  1536,
    responseMimeType: 'text/plain' as const,
  };

  async function geminiGenerateOnce(
    modelId: string,
  ): Promise<GeminiCallResult> {
    try {
      const model = genAI.getGenerativeModel(
        {
          model: modelId,
          systemInstruction: {
            role:  'system',
            parts: [{ text: input.systemPrompt }],
          },
          generationConfig,
          safetySettings,
        },
        geminiRequestOptions,
      );

      const genResult = await model.generateContent(
        { contents },
        geminiRequestOptions,
      );

      const finishReason = genResult.response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        return {
          ok:      false,
          error:   '安全フィルタにより応答がブロックされました',
          variant: 'safety',
        };
      }

      let text: string;
      try {
        text = genResult.response.text();
      } catch (textErr) {
        if (textErr instanceof GoogleGenerativeAIResponseError) {
          return {
            ok:      false,
            error:   '安全フィルタにより応答がブロックされました',
            variant: 'safety',
          };
        }
        throw textErr;
      }

      if (!text) {
        return {
          ok:      false,
          error:   'AI から空の応答が返されました',
          variant: 'empty',
        };
      }

      return { ok: true, text };
    } catch (err) {
      if (err instanceof GoogleGenerativeAIFetchError) {
        const st = err.status ?? 0;
        const detail = (err.message ?? '').slice(0, 280);
        console.error(
          '[handleInstruction] Gemini API error:',
          modelId,
          st,
          detail,
        );
        if (st === 401 || st === 403) {
          return {
            ok:         false,
            error:      '[neo:ai-config] API rejected the key (401/403)',
            variant:    'config',
            httpStatus: st,
          };
        }
        return {
          ok:         false,
          error:      `[neo:gemini-http] model=${modelId} status=${st} body=${detail}`,
          variant:    'generic',
          httpStatus: st,
        };
      }
      if (err instanceof GoogleGenerativeAIAbortError) {
        return {
          ok:      false,
          error:   'AI の応答がタイムアウトしました（30秒）',
          variant: 'timeout',
        };
      }
      if (err instanceof Error && err.name === 'TimeoutError') {
        return {
          ok:      false,
          error:   'AI の応答がタイムアウトしました（30秒）',
          variant: 'timeout',
        };
      }
      console.error('[handleInstruction] Gemini SDK error:', modelId, err);
      return {
        ok:      false,
        error:   'ネットワークエラーが発生しました',
        variant: 'network',
      };
    }
  }

  let result = await geminiGenerateOnce(primaryModel);

  const is404 =
    !result.ok &&
    result.variant !== 'config' &&
    result.variant !== 'safety' &&
    result.httpStatus === 404;

  if (is404 && primaryModel === DEFAULT_GEMINI_MODEL) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[handleInstruction] Gemini 3 Flash → preview ID retry', {
        from: primaryModel,
        to:   GEMINI_3_FLASH_ALIAS_PREVIEW,
      });
    }
    result = await geminiGenerateOnce(GEMINI_3_FLASH_ALIAS_PREVIEW);
  }

  const eligibleForFlash15Fallback = (r: GeminiCallResult): boolean => {
    if (r.ok || r.variant === 'config' || r.variant === 'safety') return false;
    if (
      typeof r.httpStatus === 'number' &&
      (r.httpStatus === 401 || r.httpStatus === 403)
    ) {
      return false;
    }
    if (typeof r.httpStatus === 'number') return true;
    return r.variant === 'timeout' || r.variant === 'network';
  };

  const canTryModelFallback =
    eligibleForFlash15Fallback(result) && fallbackModel !== primaryModel;

  if (canTryModelFallback) {
    if (process.env.NODE_ENV === 'development') {
      const httpSt = result.ok === false ? result.httpStatus : undefined;
      console.warn('[handleInstruction] Gemini model fallback', {
        from: primaryModel,
        to:   fallbackModel,
        httpStatus: httpSt,
        variant:    result.ok ? undefined : result.variant,
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

/** 請求・Ledger へ進む短い返答か（承認フローと別・pending なし時のみ） */
function _wantsLedgerDeskNavigation(message: string): boolean {
  const t = message.trim();
  if (t.length === 0 || t.length > 80) return false;
  if (
    /(ignore\s+(previous|all)|無視して|前の指示|system\s*prompt|jailbreak)/i.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /請求書作って|請求書を?作|見書|見もり|書類を?作|書類の作成|書類生成|Ledger|レジャー|会計デスク/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    t.length <= 12 &&
    /^(はい|よろしく)[!！.。…\s]*$/i.test(t)
  ) {
    return true;
  }
  return false;
}

function _formatAmountForGuidanceJa(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (amount >= 10_000 && amount % 10_000 === 0) {
    return `${amount / 10_000}万`;
  }
  if (amount >= 10_000) {
    const man = amount / 10_000;
    const rounded = Math.round(man * 10) / 10;
    const s = Number.isInteger(rounded)
      ? String(rounded)
      : String(rounded);
    return `${s}万`;
  }
  return `¥${amount.toLocaleString('ja-JP')}`;
}

/** チャット経由の一括実行は INSERT_ACTIVITY のみ（他タイプはサーバーが別経路） */
function _pendingIsOnlyProjectAndActivities(actions: ParsedAction[]): boolean {
  return (
    actions.length > 0 &&
    actions.every(
      (a) => a.type === 'INSERT_PROJECT' || a.type === 'INSERT_ACTIVITY',
    )
  );
}

function _sortCompoundPending(pending: ParsedAction[]): ParsedAction[] {
  const projects = pending.filter((a) => a.type === 'INSERT_PROJECT');
  const activities = pending.filter((a) => a.type === 'INSERT_ACTIVITY');
  return [...projects, ...activities];
}

/** 成功メッセージ用（複数行は「と」でつなぐ） */
function _joinExpenseLabelsJa(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}と${parts[1]}`;
  return `${parts.slice(0, -1).join('、')}と${parts[parts.length - 1]}`;
}
