/**
 * コックピット — 自然言語で「すばやく記録」→ handleInstruction（Gemini + Agentic）
 */

'use client';

import {
  useCallback,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { handleInstruction } from '@/features/chat/actions';
import type { ParsedAction } from '@/lib/agentic-types';
import type { HandleInstructionResult } from '@/features/chat/chat-types';
import { notifyCockpitDataInvalidate } from '@/lib/supabase/chat-realtime';

const MAX_LEN = 2000;

const IS_DEV = process.env.NODE_ENV === 'development';

const PLACEHOLDER =
  '例: 6月20日、六本木でドラマ撮影、撮影40万、人件50万。新規プロジェクトを作って経として追加。\n' +
  '（Enterで送信 · Shift+Enterで改行）';

function cloneParsedActions(actions: ParsedAction[]): ParsedAction[] {
  return JSON.parse(JSON.stringify(actions)) as ParsedAction[];
}

/**
 * Gemini が <actions> を返したら「実行して」で2 回目の handleInstruction を送る。
 * nonce 登録失敗・承認情報欠落時は明確なエラーを返す。
 */
async function runQuickCaptureWithAutoConfirm(
  message: string,
): Promise<HandleInstructionResult> {
  const first = await handleInstruction({ message, history: [] });
  if (!first.ok) return first;

  const awaiting = first.agent?.awaitingConfirmation === true;
  const nActions = first.actions?.length ?? 0;
  if (!awaiting || nActions === 0) return first;

  const tok = first.agent?.pendingApprovalToken;
  const nonce = first.agent?.pendingApprovalNonce;
  const issuedRaw = first.agent?.pendingApprovalIssuedAt;
  const issuedAt =
    issuedRaw == null ? NaN : Number(issuedRaw);

  if (!tok || nonce == null || !Number.isFinite(issuedAt) || issuedAt <= 0) {
    return {
      ok:    false,
      error:
        '登録案はできましたが、自動実行の準備が整いませんでした。チャットで「実行して」と送るか、少し待ってからもう一度お試しください。',
      code:  'AGENTIC_PENDING_INCOMPLETE',
      reply: first.reply,
      actions: first.actions,
      agent: first.agent,
    };
  }

  const actionsPayload = cloneParsedActions(first.actions!);

  return await handleInstruction({
    message:                 '実行して',
    history:                 [],
    pendingActionsToConfirm: actionsPayload,
    pendingApprovalToken:    tok,
    pendingApprovalNonce:    nonce,
    pendingApprovalIssuedAt: issuedAt,
    ...(first.agent?.pendingApprovalDevBypass === true
      ? { pendingApprovalDevBypass: true }
      : {}),
  });
}

export function CockpitQuickCapture() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err';
    message: string;
  } | null>(null);
  const [devAiToast, setDevAiToast] = useState<string | null>(null);
  const [showLedgerHint, setShowLedgerHint] = useState(false);

  const submit = useCallback(() => {
    const message = text.trim();
    console.log('[CockpitQuickCapture] submit()', {
      messageLen: message.length,
      isPending,
    });
    if (!message) {
      console.warn('[CockpitQuickCapture] 送信スキップ: 入力が空です');
      return;
    }
    if (isPending) {
      console.warn('[CockpitQuickCapture] 送信スキップ: 処理中です');
      return;
    }
    if (message.length > MAX_LEN) {
      console.warn('[CockpitQuickCapture] 送信スキップ: 文字数超過', message.length);
      setFeedback({
        kind: 'err',
        message: `メッセージは${MAX_LEN}文字以内にしてください`,
      });
      return;
    }
    setFeedback(null);
    setDevAiToast(null);
    setShowLedgerHint(false);
    startTransition(async () => {
      console.log('[CockpitQuickCapture] handleInstruction 呼び出し', {
        messagePreview: message.slice(0, 120),
      });
      try {
        const finalResult = await runQuickCaptureWithAutoConfirm(message);
        console.log('[CockpitQuickCapture] handleInstruction 完了', {
          ok: finalResult.ok,
          code: finalResult.code,
        });

        if (!finalResult.ok) {
          console.error('[CockpitQuickCapture] handleInstruction エラー応答', finalResult);
          setFeedback({
            kind: 'err',
            message:
              finalResult.error ??
              'ちょっと接続が不安定みたい…。もう一度だけ試してみて。',
          });
          if (
            IS_DEV &&
            finalResult.code === 'AI_ERROR' &&
            finalResult._debug &&
            typeof finalResult._debug === 'object'
          ) {
            const d = finalResult._debug as Record<string, unknown>;
            const tech =
              typeof d.geminiTechnicalError === 'string'
                ? d.geminiTechnicalError
                : '';
            const hint =
              typeof d.aiHint === 'string' ? d.aiHint : '';
            const parts = [
              tech && `Gemini: ${tech}`,
              hint && `分類: ${hint}`,
            ].filter(Boolean);
            setDevAiToast(
              parts.length > 0
                ? parts.join('\n')
                : `[AI_ERROR _debug]\n${JSON.stringify(d, null, 2).slice(0, 1200)}`,
            );
          }
          // 失敗してもプロジェクトが作られている可能性があるため refresh は実行する
          notifyCockpitDataInvalidate('quick-capture-error');
          router.refresh();
          return;
        }
        setDevAiToast(null);
        setText('');
        setFeedback({
          kind: 'ok',
          message: finalResult.reply?.trim() || 'Neo が内容を整理しました。',
        });
        const executed =
          finalResult.agent?.loopPhase === 'executed' ||
          finalResult.agent?.phase === 'confirm_executed';
        setShowLedgerHint(Boolean(executed));
        notifyCockpitDataInvalidate('quick-capture');

        // RSC キャッシュを即時 + 1フレーム後の2段階 refresh
        // → server の revalidatePath が浸透する前に fetch しても古いデータを掴まないように
        router.refresh();
        if (executed) {
          // 少し待ってから再 refresh（Supabase → Next.js RSC cache 浸透待ち）
          setTimeout(() => router.refresh(), 500);
        }

        // 作成されたプロジェクトへのナビゲーション優先度:
        // 1. serverが明示的に clientNavigation を返した場合（Ledger Desk など）
        // 2. Agentic 実行で作成されたプロジェクト ID がある場合は詳細ページへ
        const nav = finalResult.clientNavigation?.href;
        if (nav) {
          router.push(nav);
        } else if (
          executed &&
          finalResult.executedProjectId &&
          typeof finalResult.executedProjectId === 'string'
        ) {
          // プロジェクト詳細ページへ遷移してもよいかを判断:
          // 経費が紐づいた場合のみ遷移（プロジェクト作成のみなら一覧）
          const actCount = finalResult.executedActivityCount ?? 0;
          const dest = actCount > 0
            ? `/projects/${finalResult.executedProjectId}`
            : '/projects';
          console.log('[CockpitQuickCapture] Navigating to:', dest, { actCount });
          // 少し待ってから遷移（router.refresh() の後にページ遷移すると RSC が stale になる場合がある）
          setTimeout(() => router.push(dest), 600);
        }
      } catch (err) {
        console.error('[CockpitQuickCapture] handleInstruction 例外', err);
        setFeedback({
          kind: 'err',
          message:
            '送信中にエラーが発生しました。コンソールを開発者にお伝えください。',
        });
      }
    });
  }, [text, isPending, router]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section
      className="cockpit-quick-capture"
      aria-labelledby="cockpit-quick-capture-heading"
    >
      <div className="cockpit-quick-capture__inner">
        <h2 id="cockpit-quick-capture-heading" className="cockpit-quick-capture__title">
          すばやく記録
        </h2>
        <p className="cockpit-quick-capture__lead">
          日付・場所・作業内容・金などを、そのまま文章で入力。Neo が解読して記録案を出します。
        </p>
        <textarea
          className="cockpit-quick-capture__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDER}
          disabled={isPending}
          rows={5}
          maxLength={MAX_LEN + 50}
          aria-label="自然言語で収支・案件を記録"
        />
        <div className="cockpit-quick-capture__toolbar">
          <span className="cockpit-quick-capture__counter" aria-live="polite">
            {text.length > MAX_LEN * 0.85 ? `${text.length} / ${MAX_LEN}` : ''}
          </span>
          <div className="cockpit-quick-capture__actions">
            <Link href="/chat" className="cockpit-quick-capture__link-chat">
              チャットで続き
            </Link>
            <button
              type="button"
              className="cockpit-quick-capture__submit"
              onPointerDown={() => {
                const msg = text.trim();
                console.log('ボタンが押されました', msg, {
                  disabled: isPending || msg.length === 0,
                  isPending,
                });
              }}
              onClick={() => {
                const msg = text.trim();
                console.log('ボタン onClick', msg);
                submit();
              }}
              disabled={isPending || text.trim().length === 0}
            >
              {isPending ? 'Neo が考えています…' : 'すばやく記録'}
            </button>
          </div>
        </div>
        {feedback ? (
          <div
            className={
              feedback.kind === 'ok'
                ? 'cockpit-quick-capture__feedback cockpit-quick-capture__feedback--ok'
                : 'cockpit-quick-capture__feedback cockpit-quick-capture__feedback--err'
            }
            role="status"
          >
            {feedback.message}
            {feedback.kind === 'ok' && showLedgerHint ? (
              <div className="cockpit-quick-capture__ledger-hint">
                <Link href="/accounting-desk" className="cockpit-quick-capture__ledger-link">
                  Ledger Desk で請求書・見書を作成
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        {IS_DEV && devAiToast ? (
          <div
            className="cockpit-quick-capture__dev-ai-toast"
            role="status"
            aria-label="開発用 AI エラー詳細"
          >
            <div className="cockpit-quick-capture__dev-ai-toast-label">
              開発環境: AI エラー詳細
            </div>
            <pre className="cockpit-quick-capture__dev-ai-toast-body">
              {devAiToast}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
