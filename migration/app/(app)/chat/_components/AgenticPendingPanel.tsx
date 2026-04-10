/**
 * Agentic Loop: Neo がまとめた目標・計画と、承認待ちの登録案
 * （Soul 済みテキストがチャットに流れるのと連動し、ここは「確定前の整理メモ」として表示）
 *
 * MessageBubble に goal/plan を埋め込んだ直後の承認待ちでは `omitGoalPlan` で
 * 目標・計画カードを省略し、登録案・操作に集中する（二重表示を避ける）。
 */

'use client';

import type { CSSProperties } from 'react';
import type { ParsedAction } from '@/features/chat/chat-types';
import { APPROVAL_PHRASE_EXAMPLES } from '@/lib/agent-chat-confirm';

const cardBase: CSSProperties = {
  borderRadius: 10,
  padding:      '12px 14px',
  marginBottom: 10,
  fontSize:     13,
  lineHeight:   1.55,
};

export function AgenticPendingPanel({
  goalSummary,
  planSummary,
  omitGoalPlan,
  pendingActions,
  hasDrivePending,
  onConfirm,
}: {
  goalSummary?:    string | null;
  planSummary?:    string | null;
  /** true のとき目標・計画カードを出さない（直近のチャットバブルに同内容を表示済みのため） */
  omitGoalPlan?:   boolean;
  pendingActions:  ParsedAction[];
  hasDrivePending: boolean;
  onConfirm:       () => void;
}) {
  if (!pendingActions.length) return null;

  const showGoalPlan = !omitGoalPlan && (goalSummary?.trim() || planSummary?.trim());

  return (
    <div
      className="chat-agentic-pending"
      role="region"
      aria-label="Neoの登録案（承認待ち）"
      style={{
        margin:       '8px 12px',
        padding:      '16px 16px 18px',
        borderRadius: 14,
        background:   'linear-gradient(160deg, rgba(79, 70, 229, 0.08) 0%, rgba(129, 140, 248, 0.06) 100%)',
        border:       '1px solid rgba(79, 70, 229, 0.3)',
        boxShadow:    '0 6px 24px -10px rgba(79, 70, 229, 0.35)',
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <p
          style={{
            margin:        0,
            fontSize:      12,
            fontWeight:    800,
            letterSpacing: '0.04em',
            color:         'var(--color-neo-primary, #4F46E5)',
          }}
        >
          Neo のご提案 · いまの登録案
        </p>
        <p
          style={{
            margin:     '6px 0 0',
            fontSize:   12,
            lineHeight: 1.45,
            color:      'var(--text-muted, #536471)',
          }}
        >
          {showGoalPlan
            ? 'チャットで話した内容を、Neoが目標と計画に整理したうえで、下の「登録案」にまとめています。問題なければ確定しましょう。'
            : omitGoalPlan
              ? '目標と計画は、直近の Neo のメッセージに表示しています。下の登録案を確定してよければ、ボタンを押すか「実行して」と送ってください。'
              : '下の登録案の内容で記帳してよければ、ボタンを押すか「実行して」と送ってください。'}
        </p>
      </header>

      {showGoalPlan && goalSummary ? (
        <div
          style={{
            ...cardBase,
            background:   'rgba(255,255,255,0.88)',
            borderLeft:   '4px solid rgba(79, 70, 229, 0.9)',
            boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.8)',
            color:        'var(--text-main, #0F1419)',
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
          <p style={{ margin: '8px 0 0', fontWeight: 500, fontSize: 14 }}>{goalSummary}</p>
        </div>
      ) : null}

      {showGoalPlan && planSummary ? (
        <div
          style={{
            ...cardBase,
            background:   'rgba(255,255,255,0.75)',
            borderLeft:   '4px solid rgba(5, 150, 105, 0.85)',
            color:        'var(--text-main, #0F1419)',
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
          <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', fontSize: 13 }}>{planSummary}</p>
        </div>
      ) : null}

      {/* チャットに目標・計画を出した直後は omitGoalPlan。登録案ブロックへ視覚的に区切りを入れて切り替わりを明確に */}
      {omitGoalPlan ? (
        <div
          aria-hidden
          style={{
            margin:     '4px 0 12px',
            borderTop:  '1px solid rgba(79, 70, 229, 0.14)',
            opacity:    0.9,
          }}
        />
      ) : null}

      <ToolPreview actions={pendingActions} />

      {hasDrivePending ? (
        <aside
          style={{
            margin:       '12px 0 14px',
            padding:      '12px 14px',
            fontSize:     12,
            lineHeight:   1.6,
            color:        'var(--text-main, #0F1419)',
            background:   'linear-gradient(90deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.05) 100%)',
            borderRadius: 10,
            border:       '1px solid rgba(16, 185, 129, 0.35)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 11, color: 'rgb(5, 120, 90)' }}>
            いま、二つの「確定待ち」があります
          </p>
          <p style={{ margin: 0, color: 'var(--text-muted, #536471)' }}>
            <strong style={{ color: 'rgba(79, 70, 229, 0.95)' }}>紫のカード</strong>
            … このチャットで話した内容から作った、
            <strong>テキストの登録案</strong>です。
          </p>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted, #536471)' }}>
            <strong style={{ color: 'rgb(5, 120, 90)' }}>緑のバナー（上）</strong>
            … Google Drive に保存した
            <strong>ファイル付きの記帳</strong>の確認です。どちらも、確定するまでは取り消しや見直しができます。
          </p>
        </aside>
      ) : null}

      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted, #536471)' }}>
        よければ、下のボタンを押すか、チャットに
        <strong style={{ color: 'var(--text-main, #0F1419)' }}>「実行して」</strong>
        と送ってください。Neoが、その内容で記帳の手続きを進めます。
      </p>

      <p
        style={{
          margin:     '0 0 14px',
          fontSize:   11,
          color:      'var(--text-muted, #536471)',
          lineHeight: 1.45,
        }}
      >
        言い方の例: {APPROVAL_PHRASE_EXAMPLES.slice(0, 6).join(' · ')} …
      </p>

      <button
        type="button"
        className="chat-agentic-confirm-btn"
        style={{
          display:      'block',
          width:        '100%',
          maxWidth:     340,
          padding:      '13px 20px',
          fontSize:     14,
          fontWeight:   700,
          borderRadius: 999,
          border:       'none',
          cursor:       'pointer',
          background:   'var(--color-neo-primary, #4F46E5)',
          color:        '#fff',
          boxShadow:    '0 4px 16px -4px rgba(79, 70, 229, 0.55)',
        }}
        onClick={onConfirm}
      >
        実行して登録する
      </button>
    </div>
  );
}

function ToolPreview({ actions }: { actions: ParsedAction[] }) {
  const lines = actions.map((a, i) => {
    if (a.type === 'INSERT_ACTIVITY' && a.payload) {
      const p = a.payload as Record<string, unknown>;
      const title = typeof p.title === 'string' ? p.title : '（タイトル）';
      const amount = typeof p.amount === 'number' ? p.amount : '?';
      const cat = typeof p.category === 'string' ? p.category : '';
      const date = typeof p.date === 'string' ? p.date : '';
      const lineDate = date ? ` · ${date}` : '';
      return {
        key:   `${a.type}-${i}`,
        text:  `${cat} 「${title}」 ¥${typeof amount === 'number' ? amount.toLocaleString('ja-JP') : amount}${lineDate}`,
      };
    }
    return { key: `${a.type}-${i}`, text: `${a.type}` };
  });

  return (
    <div
      style={{
        ...cardBase,
        marginBottom: 12,
        background:   'rgba(255,255,255,0.55)',
        border:       '1px dashed rgba(79, 70, 229, 0.25)',
        fontSize:     13,
        color:        'var(--text-main, #0F1419)',
      }}
    >
      <span
        style={{
          fontSize:      10,
          fontWeight:    800,
          letterSpacing: '0.06em',
          color:         'var(--text-muted, #536471)',
        }}
      >
        登録案（承認後に記帳）
      </span>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
        {lines.map((item, idx) => (
          <li key={item.key} style={{ marginBottom: idx < lines.length - 1 ? 6 : 0 }}>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
