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
import { handleInstruction } from '@/features/chat/actions';
import { notifyCockpitDataInvalidate } from '@/lib/supabase/chat-realtime';

const MAX_LEN = 2000;

const IS_DEV = process.env.NODE_ENV === 'development';

const PLACEHOLDER =
  '例: 5月20日、渋谷パルコでドラマ撮影、経費は撮影費40万、人件費10万\n' +
  '（Enterで送信 · Shift+Enterで改行）';

export function CockpitQuickCapture() {
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err';
    message: string;
  } | null>(null);
  const [devAiToast, setDevAiToast] = useState<string | null>(null);

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
    startTransition(async () => {
      console.log('[CockpitQuickCapture] handleInstruction 呼び出し', {
        messagePreview: message.slice(0, 120),
      });
      try {
        const result = await handleInstruction({ message, history: [] });
        console.log('[CockpitQuickCapture] handleInstruction 完了', {
          ok: result.ok,
          code: result.code,
        });
        if (!result.ok) {
          console.error('[CockpitQuickCapture] handleInstruction エラー応答', result);
          setFeedback({
            kind: 'err',
            message:
              result.error ??
              'ちょっと接続が不安定みたい…。もう一度だけ試してみて。',
          });
          if (
            IS_DEV &&
            result.code === 'AI_ERROR' &&
            result._debug &&
            typeof result._debug === 'object'
          ) {
            const d = result._debug as Record<string, unknown>;
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
          return;
        }
        setDevAiToast(null);
        setText('');
        setFeedback({
          kind: 'ok',
          message: result.reply?.trim() || 'Neo が内容を整理しました。',
        });
        notifyCockpitDataInvalidate('quick-capture');
      } catch (err) {
        console.error('[CockpitQuickCapture] handleInstruction 例外', err);
        setFeedback({
          kind: 'err',
          message:
            '送信中にエラーが発生しました。コンソールを開発者にお伝えください。',
        });
      }
    });
  }, [text, isPending]);

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
          日付・場所・作業内容・金額などを、そのまま文章で入力。Neo が解読して記録案を出します。
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
                const message = text.trim();
                console.log('ボタンが押されました', message, {
                  disabled: isPending || message.length === 0,
                  isPending,
                });
              }}
              onClick={() => {
                const message = text.trim();
                console.log('ボタン onClick', message);
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
