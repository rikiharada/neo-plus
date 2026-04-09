/**
 * features/activities/soul-pipe.ts
 * 収支登録時の Soul メッセージ生成パイプライン
 *
 * Server Actions から呼ばれる純粋関数（副作用なし）。
 * 'use server' は付けない（Server Actions ファイルからインポートされる）。
 */

import type { NeoSoul }    from '@/features/soul/server';
import type { ActivityRow } from '@/lib/supabase/types';

// ─── 税区分ヒント辞書 ─────────────────────────────────────────────

const TAX_CATEGORY_HINTS: Record<string, string> = {
  '交通費':     '交通費は経費として計上できます（事業目的の場合）。',
  '通信費':     '通信費は事業利用割合に応じて按分できます。',
  '消耗品費':   '10万円未満の備品は消耗品費として一括計上できます。',
  '外注費':     '外注費の支払いには源泉徴収が必要な場合があります。',
  '接待交際費': '接待交際費は事業関連性の証明が重要です（領収書保管を）。',
  '広告宣伝費': '広告費は全額損金算入できます。',
  '地代家賃':   '自宅兼事務所の場合は按分計算が必要です。',
};

const TAX_DISCLAIMER =
  '※ これは参考情報です。正確な税務判断はお近くの税理士にご相談ください。';

// ─── パイプライン入力型 ──────────────────────────────────────────

export interface ActivitySoulInput {
  action:   'insert' | 'update' | 'delete';
  activity: Partial<ActivityRow> & { id: string };
  soul:     NeoSoul;
}

// ─── メインパイプライン ──────────────────────────────────────────

/**
 * 収支操作後に表示する Soul メッセージを生成する。
 * Soul の traits に基づいてトーンを調整する。
 */
export function applyActivitySoul(input: ActivitySoulInput): string {
  const { action, activity, soul } = input;
  const { traits } = soul;

  // ステップ1: 基本メッセージ
  let message = _buildBaseMessage(action, activity);

  // ステップ2: カテゴリ税務ヒント（precision が高い場合に付加）
  if (traits.precision > 0.8 && activity.category) {
    const hint = TAX_CATEGORY_HINTS[activity.category];
    if (hint) {
      message += `\n\n💡 ${hint}`;
      message += `\n${TAX_DISCLAIMER}`;
    }
  }

  // ステップ3: 励ましメッセージ（encouragement が高い場合に確率付加）
  if (traits.encouragement > 0.6 && action === 'insert') {
    if (Math.random() < traits.encouragement * 0.3) {
      message += _getEncouragement();
    }
  }

  // ステップ4: 丁寧度調整
  if (traits.formality < 0.5) {
    // カジュアルモード: ですます → だ・である（ここでは省略、要件次第で実装）
  }

  return message;
}

// ─── ヘルパー ───────────────────────────────────────────────────

function _buildBaseMessage(
  action: ActivitySoulInput['action'],
  activity: ActivitySoulInput['activity'],
): string {
  const amount = activity.amount
    ? `¥${activity.amount.toLocaleString('ja-JP')}`
    : '';
  const title = activity.title ?? '';

  switch (action) {
    case 'insert':
      return `「${title}」${amount ? `（${amount}）` : ''}を記録しました。`;
    case 'update':
      return `「${title}」の内容を更新しました。`;
    case 'delete':
      return `「${title}」を削除しました。`;
    default:
      return '処理が完了しました。';
  }
}

function _getEncouragement(): string {
  const messages = [
    '\n\n記録を続けることが確定申告をラクにします。この調子で！',
    '\n\nコツコツ記録、お疲れ様です！',
    '\n\n記帳の習慣がついていますね。素晴らしいです。',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
