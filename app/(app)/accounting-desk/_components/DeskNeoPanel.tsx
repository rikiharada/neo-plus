/**
 * app/(app)/accounting-desk/_components/DeskNeoPanel.tsx
 * 右ペイン — デスク専用 Neo チャットエリア
 *
 * 'use client' 必須（スクロール・状態参照）
 *
 * チャットページの ChatWindow とは独立した軽量版。
 * - handleInstruction は使わず、デスク専用メッセージのみ表示
 * - ユーザーからのテキスト返信は Step 2 以降で実装
 *
 * 状態は LedgerDeskClient が管理し、messages を props で受け取る。
 */

'use client';

import { useEffect, useRef, memo } from 'react';
import type { DeskMessage }        from './types';

// ─── 型定義 ─────────────────────────────────────────────────────

interface DeskNeoPanelProps {
  messages:   DeskMessage[];
  isThinking: boolean;
  className?: string;
}

// ─── コンポーネント ──────────────────────────────────────────────

export const DeskNeoPanel = memo(function DeskNeoPanel({
  messages,
  isThinking,
  className,
}: DeskNeoPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新着メッセージへ自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isThinking]);

  return (
    <section
      className={['desk-neo-panel', className].filter(Boolean).join(' ')}
      aria-label="Neo からのメッセージ"
    >
      {/* ─ パネルヘッダー ─ */}
      <header className="desk-neo-panel-header">
        <div className="desk-neo-avatar" aria-hidden="true">
          <NeoAvatar />
        </div>
        <div>
          <p className="desk-neo-name">Neo</p>
          <p className="desk-neo-role">会計エージェント</p>
        </div>
        {isThinking && (
          <span className="desk-neo-thinking" aria-live="polite" aria-label="Neoが考えています">
            <ThinkingDots />
          </span>
        )}
      </header>

      {/* ─ メッセージエリア ─ */}
      <div
        className="desk-neo-messages"
        role="log"
        aria-label="デスクのメッセージ履歴"
        aria-live="polite"
        aria-relevant="additions"
      >
        {/* 空状態 */}
        {messages.length === 0 && !isThinking && (
          <WaitingState />
        )}

        {/* メッセージバブル */}
        {messages.map((msg, i) => (
          <DeskMessageBubble
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1 && !isThinking}
          />
        ))}

        {/* Thinking インジケーター */}
        {isThinking && (
          <div className="desk-neo-bubble desk-neo-bubble--thinking" role="status" aria-label="Neoが考えています">
            <ThinkingDots />
          </div>
        )}

        {/* スクロール基準点 */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </section>
  );
});

// ─── 個別メッセージバブル ────────────────────────────────────────

const DeskMessageBubble = memo(function DeskMessageBubble({
  message,
  isLatest,
}: {
  message:   DeskMessage;
  isLatest:  boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isNeo = message.role === 'assistant';

  useEffect(() => {
    if (isLatest && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isLatest]);

  return (
    <div
      ref={ref}
      className={[
        'desk-bubble-row',
        isNeo ? 'desk-bubble-row--neo' : 'desk-bubble-row--user',
      ].join(' ')}
    >
      {isNeo && (
        <div className="desk-bubble-avatar" aria-hidden="true">
          <NeoAvatar size={24} />
        </div>
      )}
      <div
        className={['desk-neo-bubble', isNeo ? 'desk-neo-bubble--neo' : 'desk-neo-bubble--user'].join(' ')}
        role="article"
        aria-label={isNeo ? 'Neoからのメッセージ' : 'あなたのメッセージ'}
      >
        <p className="desk-bubble-text">
          {message.content.split('\n').map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
        <time
          className="desk-bubble-time"
          dateTime={message.timestamp}
          title={new Date(message.timestamp).toLocaleString('ja-JP')}
        >
          {_fmtTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
});

// ─── 空状態（待機） ──────────────────────────────────────────────

function WaitingState() {
  return (
    <div className="desk-neo-waiting">
      <div className="desk-neo-waiting-avatar" aria-hidden="true">
        <NeoAvatar size={40} />
      </div>
      <p className="desk-neo-waiting-text">
        ファイルをドロップすると<br />
        Neoが分析して話しかけます
      </p>
    </div>
  );
}

// ─── Neo アバター ────────────────────────────────────────────────

function NeoAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Neo アバター"
    >
      <circle cx="16" cy="16" r="16" fill="var(--color-neo-primary, #4F46E5)" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontSize="14"
        fontWeight="bold"
        fill="white"
        fontFamily="system-ui, sans-serif"
      >
        N
      </text>
    </svg>
  );
}

// ─── Thinking アニメーション ─────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-hidden="true">
      <span className="thinking-dot" style={{ animationDelay: '0ms' }} />
      <span className="thinking-dot" style={{ animationDelay: '160ms' }} />
      <span className="thinking-dot" style={{ animationDelay: '320ms' }} />
    </span>
  );
}

// ─── ユーティリティ ──────────────────────────────────────────────

function _fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
