/**
 * app/(app)/chat/_components/MessageBubble.tsx
 * チャットのメッセージバブルコンポーネント
 *
 * レイアウト:
 *   Neo（assistant）  → 左寄せ / アバター付き / グレー背景
 *   ユーザー（user）  → 右寄せ / アバターなし / Neo+ カラー背景
 *
 * ⚠️ 'use client' が必要（アニメーション・DOM 操作のため）
 */

'use client';

import { useEffect, useRef, useState, useMemo, memo } from 'react';
import type { CSSProperties } from 'react';
import type { ChatMessage }   from '@/features/chat/chat-types';

/**
 * 折りたたみ閾値: 読みやすさ優先で、十分に長いときだけ折る（通常の 2〜5 ステップは開いたまま）
 * （定数は MIGRATION_GUIDE §8-2.1 と揃える）
 */
const PLAN_COLLAPSE_MIN_LINES = 10;
const PLAN_COLLAPSE_MIN_CHARS = 450;
const GOAL_COLLAPSE_MIN_CHARS = 200;

// ─── 型定義 ─────────────────────────────────────────────────────

interface MessageBubbleProps {
  message:   ChatMessage;
  isLatest?: boolean;          // 最新メッセージならスクロールアニメーション
}

// ─── コンポーネント ──────────────────────────────────────────────

export const MessageBubble = memo(function MessageBubble({
  message,
  isLatest,
}: MessageBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isAssistant = message.role === 'assistant';
  const goalPlan =
    isAssistant && (message.goalSummary?.trim() || message.planSummary?.trim());

  // 最新メッセージへのスムーズスクロール
  useEffect(() => {
    if (isLatest && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isLatest]);

  return (
    <div
      ref={ref}
      className={[
        'message-row',
        isAssistant ? 'message-row--neo' : 'message-row--user',
        goalPlan ? 'message-row--align-start' : 'message-row--align-end',
        'animate-fadeIn',
      ].join(' ')}
    >
      {/* ─ アバター（Neoのみ） ─ */}
      {isAssistant && (
        <div className="neo-avatar" aria-hidden="true">
          <NeoAvatar />
        </div>
      )}

      <div className="message-row__content">
        {/* Neo がまとめた目標・計画（履歴に残る・提案のみターンでも表示） */}
        {goalPlan ? (
          <GoalPlanInlineCards
            goalSummary={message.goalSummary?.trim()}
            planSummary={message.planSummary?.trim()}
          />
        ) : null}

        {/* ─ バブル本体 ─ */}
        <div
          className={[
            'message-bubble',
            isAssistant ? 'message-bubble--neo' : 'message-bubble--user',
          ].join(' ')}
          role="article"
          aria-label={isAssistant ? 'Neoからのメッセージ' : 'あなたのメッセージ'}
        >
          {/* テキスト（改行を <br> に変換） */}
          <p className="message-text">
            {message.content.split('\n').map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </span>
            ))}
          </p>

          {/* タイムスタンプ */}
          <time
            className="message-timestamp"
            dateTime={message.timestamp}
            title={new Date(message.timestamp).toLocaleString('ja-JP')}
          >
            {_formatTime(message.timestamp)}
          </time>
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

const textWrap: CSSProperties = {
  overflowWrap:   'anywhere',
  wordBreak:      'break-word',
  hyphens:        'auto',
};

/** チャット本文の上に置く、Neo の目標・計画（AgenticPendingPanel と色・左ボーダーを揃え、外枠は軽め） */
function GoalPlanInlineCards({
  goalSummary,
  planSummary,
}: {
  goalSummary?: string;
  planSummary?: string;
}) {
  const [goalExpanded, setGoalExpanded] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);

  const goalLong = useMemo(
    () => Boolean(goalSummary && goalSummary.length >= GOAL_COLLAPSE_MIN_CHARS),
    [goalSummary],
  );
  const planLong = useMemo(() => {
    if (!planSummary) return false;
    const lines = planSummary.split('\n').length;
    return lines >= PLAN_COLLAPSE_MIN_LINES || planSummary.length >= PLAN_COLLAPSE_MIN_CHARS;
  }, [planSummary]);

  return (
    <div
      className="neo-goal-plan-inline"
      role="group"
      aria-label="Neoが整理した目標と計画"
      data-agentic="goal-plan-inline"
      style={{
        width:        '100%',
        padding:      '8px 10px',
        borderRadius: 12,
        border:       '1px solid rgba(79, 70, 229, 0.12)',
        background:   'linear-gradient(165deg, rgba(79, 70, 229, 0.04) 0%, rgba(129, 140, 248, 0.025) 100%)',
        boxShadow:    '0 1px 10px -5px rgba(79, 70, 229, 0.16)',
      }}
    >
      {goalSummary ? (
        <div style={{ marginBottom: planSummary ? 8 : 0 }}>
          <div
            style={{
              borderRadius:   10,
              padding:        '10px 12px',
              background:     'rgba(255,255,255,0.92)',
              borderLeft:     '4px solid rgba(79, 70, 229, 0.88)',
              boxShadow:      'inset 0 1px 0 rgba(255,255,255,0.85)',
              color:          'var(--text-main, #0F1419)',
              fontSize:       13,
              lineHeight:     1.6,
              ...textWrap,
            }}
          >
            <span
              style={{
                fontSize:      10,
                fontWeight:    800,
                letterSpacing: '0.08em',
                color:         'rgba(79, 70, 229, 0.85)',
              }}
            >
              読み取った目標
            </span>
            <p
              style={{
                margin:     '6px 0 0',
                fontWeight: 500,
                maxHeight:  goalLong && !goalExpanded ? '5.2em' : undefined,
                overflow:   goalLong && !goalExpanded ? 'hidden' : undefined,
              }}
            >
              {goalSummary}
            </p>
            {goalLong ? (
              <button
                type="button"
                aria-expanded={goalExpanded}
                onClick={() => setGoalExpanded((e) => !e)}
                style={{
                  marginTop:    6,
                  padding:      0,
                  border:       'none',
                  background:   'none',
                  cursor:       'pointer',
                  fontSize:     12,
                  fontWeight:   600,
                  color:        'var(--color-neo-primary, #4F46E5)',
                }}
              >
                {goalExpanded ? '閉じる' : '続きを表示'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {planSummary ? (
        <div
          style={{
            borderRadius: 10,
            padding:      '10px 12px',
            background:   'rgba(255,255,255,0.82)',
            borderLeft:   '4px solid rgba(5, 150, 105, 0.82)',
            color:        'var(--text-main, #0F1419)',
            fontSize:     13,
            lineHeight:   1.65,
            ...textWrap,
          }}
        >
          <span
            style={{
              fontSize:      10,
              fontWeight:    800,
              letterSpacing: '0.08em',
              color:         'rgba(5, 120, 90, 0.9)',
            }}
          >
            進め方の計画
          </span>
          <p
            style={{
              margin:       '6px 0 0',
              whiteSpace:   'pre-wrap',
              maxHeight:    planLong && !planExpanded ? '11em' : undefined,
              overflow:     planLong && !planExpanded ? 'hidden' : undefined,
            }}
          >
            {planSummary}
          </p>
          {planLong ? (
            <button
              type="button"
              aria-expanded={planExpanded}
              onClick={() => setPlanExpanded((e) => !e)}
              style={{
                marginTop:    6,
                padding:      0,
                border:       'none',
                background:   'none',
                cursor:       'pointer',
                fontSize:     12,
                fontWeight:   600,
                color:        'rgb(5, 120, 90)',
              }}
            >
              {planExpanded ? '閉じる' : '全文を表示'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Neo アバター SVG ────────────────────────────────────────────

function NeoAvatar() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
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

// ─── ユーティリティ ──────────────────────────────────────────────

function _formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ja-JP', {
      hour:   '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
