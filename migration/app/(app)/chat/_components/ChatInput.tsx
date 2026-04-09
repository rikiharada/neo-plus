/**
 * app/(app)/chat/_components/ChatInput.tsx
 * チャット入力欄コンポーネント
 *
 * 機能:
 *   - Shift+Enter で改行、Enter で送信
 *   - 送信中はボタン無効化 + ローディング表示
 *   - 文字数カウンター（2000文字上限）
 *   - テキストエリア高さ自動調整
 *
 * ⚠️ 'use client' が必要（キーボードイベント・フォームハンドリング）
 */

'use client';

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';

// ─── 型定義 ─────────────────────────────────────────────────────

interface ChatInputProps {
  onSend:    (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_LENGTH = 2000;

// ─── コンポーネント ──────────────────────────────────────────────

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'メッセージを入力…（Shift+Enterで改行）',
}: ChatInputProps) {
  const [value, setValue]   = useState('');
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading  = isPending || disabled;
  const overLimit  = value.length > MAX_LENGTH;
  const canSubmit  = value.trim().length > 0 && !isLoading && !overLimit;

  // ─ テキストエリア高さ自動調整 ──────────────────────────────────
  function _adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  // ─ 変更ハンドラー ───────────────────────────────────────────────
  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    _adjustHeight();
  }

  // ─ キーボードハンドラー ─────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) handleSubmit();
    }
  }

  // ─ 送信ハンドラー ───────────────────────────────────────────────
  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;

    const message = value.trim();
    setValue('');
    // テキストエリア高さをリセット
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // useTransition で UI をブロックしない
    startTransition(async () => {
      await onSend(message);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="chat-input-form"
      aria-label="チャット入力フォーム"
    >
      <div className="chat-input-wrapper">
        {/* ─ テキストエリア ─ */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          maxLength={MAX_LENGTH + 100}  // ソフトリミット（UI で警告表示）
          rows={1}
          aria-label="メッセージ入力"
          aria-describedby="chat-input-hint"
          className={[
            'chat-input-textarea',
            overLimit ? 'chat-input-textarea--error' : '',
          ].join(' ')}
        />

        {/* ─ 文字数カウンター ─ */}
        <div
          id="chat-input-hint"
          className={[
            'chat-input-counter',
            overLimit ? 'chat-input-counter--error' : '',
          ].join(' ')}
          aria-live="polite"
        >
          {value.length > MAX_LENGTH * 0.8
            ? `${value.length} / ${MAX_LENGTH}`
            : null}
        </div>
      </div>

      {/* ─ 送信ボタン ─ */}
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label={isLoading ? '送信中…' : '送信'}
        className={[
          'chat-send-btn',
          isLoading ? 'chat-send-btn--loading' : '',
        ].join(' ')}
      >
        {isLoading ? <LoadingSpinner /> : <SendIcon />}
      </button>
    </form>
  );
}

// ─── アイコンコンポーネント ──────────────────────────────────────

function SendIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
