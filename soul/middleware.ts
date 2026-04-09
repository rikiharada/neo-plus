/**
 * soul/middleware.ts
 * Neo+ Soul Container — Post-generation Middleware
 *
 * 役割:
 *   Gemini の生出力（intent JSON の `answer` フィールド等）を受け取り、
 *   Soul の traits / voice / behavior_rules を適用して
 *   「Neoらしい優しい会計士口調」に変換する。
 *
 * 処理パイプライン（適用順）:
 *   1. forbiddenPhrases 置換
 *   2. 過剰服従語クリーニング (rule_no_subservient_tone)
 *   3. 励まし挿入 (encouragement injection)
 *   4. 会計コメントの補足追記 (accounting context)
 *   5. 文末語尾の統一 (formality tuning)
 *   6. 税法免責事項の自動付与 (tax disclaimer)
 */

import type { NeoSoul, BehaviorRule, SoulTraits } from './config.ts';
import { NEO_DEFAULT_SOUL } from './config.ts';

// ─── 入出力型 ────────────────────────────────────────────────────

/** Gemini intent ルーターが返す1アクション */
export interface GeminiIntentAction {
  action: string;
  answer?: string;
  title?: string;
  category?: string;
  amount?: number;
  tax_comment?: string;
  project_name?: string;
  /** その他任意フィールドを受け入れる */
  [key: string]: unknown;
}

/** Middleware への入力 */
export interface SoulMiddlewareInput {
  /** Gemini が返した生のアクション配列 */
  rawActions: GeminiIntentAction[];
  /** 使用するSoul（省略時はデフォルト） */
  soul?: NeoSoul;
  /** ユーザーの入力テキスト（コンテキスト判断に使用） */
  userInput?: string;
  /** 現在の状態（記帳件数など励ましのトリガーに使用） */
  context?: SoulContext;
}

/** アプリ状態のスナップショット（励まし判断に使用） */
export interface SoulContext {
  /** 今日の記帳件数 */
  todayEntryCount?: number;
  /** 今月の経費合計 */
  monthlyExpenseTotal?: number;
  /** アクティブプロジェクト数 */
  activeProjectCount?: number;
  /** 最後に励ましを挿入した Unix timestamp（頻度制御） */
  lastEncouragementAt?: number;
}

/** Middleware の出力 */
export interface SoulMiddlewareOutput {
  /** Soul 適用後のアクション配列 */
  processedActions: GeminiIntentAction[];
  /** 適用されたルールIDのリスト（デバッグ用） */
  appliedRules: string[];
  /** 励まし挿入フラグ */
  encouragementInjected: boolean;
  /** 免責事項付与フラグ */
  disclaimerAdded: boolean;
}

// ─── ユーティリティ ──────────────────────────────────────────────

/** シード非依存の擬似乱数（テスト再現性のため Math.random をラップ） */
const rand = (): number => Math.random();

/**
 * 配列からランダム1要素を返す。
 * 空配列の場合は undefined を返す（型安全）。
 */
const pick = <T>(arr: readonly T[]): T | undefined =>
  arr.length > 0 ? arr[Math.floor(rand() * arr.length)] : undefined;

/**
 * テキスト中の禁止フレーズを代替語に一括置換する。
 * 大文字小文字・全角半角は区別しない（日本語のため正規化省略）。
 */
const replaceForbiddenPhrases = (
  text: string,
  map: Readonly<Record<string, string>>,
): string => {
  let result = text;
  for (const [forbidden, replacement] of Object.entries(map)) {
    // グローバル置換（正規表現でエスケープ）
    const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), replacement);
  }
  return result;
};

/**
 * behavior_rules の violationPattern に引っかかる表現を
 * correctionHint で上書きする（簡易実装）。
 * 本番では LLM 再呼び出しが理想だが、コスト最適化のため Regex で代替。
 */
const applyBehaviorRuleCleaning = (
  text: string,
  rules: readonly BehaviorRule[],
  actionType: string,
  appliedRules: string[],
): string => {
  let result = text;
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    // action フィルタ
    if (rule.appliesTo && !rule.appliesTo.includes(actionType)) continue;
    if (!rule.violationPattern) continue;

    const pattern = new RegExp(rule.violationPattern, 'g');
    if (pattern.test(result)) {
      appliedRules.push(rule.id);
      // correctionHint があれば末尾に注記追加
      if (rule.correctionHint) {
        result = `${result}\n\n_📎 ${rule.correctionHint}_`;
      }
    }
  }
  return result;
};

/**
 * traits の formality スコアに基づいて文末を調整する。
 * formality >= 0.8: ございます系
 * formality >= 0.6: ですます系（デフォルト）
 * formality <  0.6: 軽め（〜ですね、〜ですよ）
 */
const tuneFormality = (
  text: string,
  formality: number,
  endings: readonly string[],
): string => {
  if (!text || endings.length === 0) return text;

  // 文末が句点で終わっていない場合だけ整形（既に適切な文末なら触らない）
  const lastChar = text.trim().slice(-1);
  if (['。', '！', '？', '…', '♪'].includes(lastChar)) return text;

  // formality に応じた語尾を選ぶ
  const formalEndingsHigh = ['でございます', 'いたします', 'ております'];
  const formalEndingsMid = ['です', 'ます', 'ください', 'ましょう'];

  const candidates = formality >= 0.8 ? formalEndingsHigh : formalEndingsMid;
  const ending = pick(candidates) ?? endings[0];
  return `${text.trim()}${ending}。`;
};

/**
 * 励まし挿入の判断ロジック。
 * - encouragementFrequency に基づく確率判定
 * - 最後の挿入から最低3分以上経過しているか
 * - 記帳件数が増えているか（context）
 */
const shouldInjectEncouragement = (
  traits: SoulTraits,
  frequency: number,
  context?: SoulContext,
): boolean => {
  // 励まし頻度の確率判定
  if (rand() > frequency) return false;

  // 最終挿入から3分以内は挿入しない（鬱陶しさ防止）
  if (context?.lastEncouragementAt) {
    const elapsed = Date.now() - context.lastEncouragementAt;
    if (elapsed < 3 * 60 * 1000) return false;
  }

  // 共感・励ましスコアが低いSoulでは挿入しない
  if (traits.encouragement < 0.4) return false;

  return true;
};

/**
 * 会計コンテキスト補足の生成。
 * ADD_EXPENSE 後に勘定科目の簡単な説明を添える。
 */
const buildAccountingContext = (action: GeminiIntentAction): string | null => {
  if (action.action !== 'ADD_EXPENSE') return null;
  if (!action.category) return null;

  const categoryHints: Record<string, string> = {
    旅費交通費:   '交通費・出張費は領収書または交通系ICカードの明細で証憑管理をお勧めします。',
    消耗品費:     '10万円未満の消耗品は一括経費計上が可能です（青色申告の場合）。',
    接待交際費:   '接待交際費は相手先・目的の記録が税務調査時に求められます。',
    外注工賃:     '外注費が年間100万円超の場合、支払調書の提出が必要になる場合があります。',
    通信費:       '自宅兼事務所の場合、使用比率に応じて家事按分が必要です。',
    水道光熱費:   '自宅兼事務所では業務使用割合（通常3割程度）での按分処理が一般的です。',
    地代家賃:     '自宅家賃の経費計上は業務使用面積の割合で按分し、根拠を残しておきましょう。',
    租税公課:     '事業税・固定資産税・自動車税（事業用）は経費計上可能です。所得税・住民税は不可です。',
    雑費:         '雑費が多くなると税務調査で説明を求められる場合があります。適切な科目への振り分けを検討してください。',
    売上高:       '売上の計上時期は「引渡基準」または「役務提供完了基準」で統一することが重要です。',
  };

  const hint = categoryHints[action.category as string];
  return hint ? `📋 **会計メモ**: ${hint}` : null;
};

/**
 * 税法免責事項を付与すべきかを判断する。
 * QUERY_KNOWLEDGE / UNKNOWN の回答で税法に言及している場合に付与。
 */
const needsTaxDisclaimer = (action: GeminiIntentAction): boolean => {
  if (!['QUERY_KNOWLEDGE', 'UNKNOWN'].includes(action.action)) return false;
  const answer = action.answer ?? '';
  const taxKeywords = ['税率', '経費', '控除', '申告', '課税', '非課税', '消費税', '所得税', '勘定科目'];
  return taxKeywords.some((kw) => answer.includes(kw));
};

const TAX_DISCLAIMER =
  '\n\n_⚖️ 上記は一般的な会計・税務の考え方です。具体的な申告・処理については担当税理士へのご確認を推奨します。_';

// ─── メイン Middleware 関数 ──────────────────────────────────────

/**
 * applySoul — Gemini 生出力に Soul を適用して変換する。
 *
 * @param input - Middleware への入力
 * @returns Soul 適用済みの出力
 *
 * @example
 * ```ts
 * const output = await applySoul({
 *   rawActions: geminiResponse,
 *   soul: userSoul ?? NEO_DEFAULT_SOUL,
 *   userInput: "タクシー代2000円",
 *   context: { todayEntryCount: 3, lastEncouragementAt: Date.now() - 600000 },
 * });
 * const finalActions = output.processedActions;
 * ```
 */
export const applySoul = (input: SoulMiddlewareInput): SoulMiddlewareOutput => {
  const soul = input.soul ?? NEO_DEFAULT_SOUL;
  const { voice, responseStyle, behaviorRules, traits } = soul;

  const appliedRules: string[] = [];
  let encouragementInjected = false;
  let disclaimerAdded = false;

  const processedActions: GeminiIntentAction[] = input.rawActions.map((action) => {
    const processed = { ...action };

    // ── Step 1: forbiddenPhrases 置換 ────────────────────────
    if (processed.answer) {
      processed.answer = replaceForbiddenPhrases(
        processed.answer,
        responseStyle.replacementMap,
      );
    }
    if (processed.tax_comment) {
      processed.tax_comment = replaceForbiddenPhrases(
        processed.tax_comment,
        responseStyle.replacementMap,
      );
    }

    // ── Step 2: behavior_rules クリーニング ──────────────────
    if (processed.answer) {
      processed.answer = applyBehaviorRuleCleaning(
        processed.answer,
        behaviorRules,
        processed.action,
        appliedRules,
      );
    }

    // ── Step 3: 励まし挿入 ───────────────────────────────────
    if (
      responseStyle.injectEncouragement &&
      shouldInjectEncouragement(traits, responseStyle.encouragementFrequency, input.context)
    ) {
      const phrase = pick(voice.encouragementPhrases);
      if (phrase && processed.answer) {
        // 文の先頭ではなく自然な位置（文末の1文前）に挿入
        const sentences = processed.answer.split('。').filter(Boolean);
        if (sentences.length > 1) {
          sentences.splice(-1, 0, phrase.replace(/。$/, ''));
          processed.answer = sentences.join('。') + '。';
        } else {
          processed.answer = `${phrase} ${processed.answer}`;
        }
        encouragementInjected = true;
        appliedRules.push('rule_encourage_progress');
      }
    }

    // ── Step 4: 会計コンテキスト補足 ────────────────────────
    if (responseStyle.addAccountingContext) {
      const ctxNote = buildAccountingContext(processed);
      if (ctxNote) {
        processed.answer = processed.answer
          ? `${processed.answer}\n\n${ctxNote}`
          : ctxNote;
        appliedRules.push('rule_accounting_context');
      }
    }

    // ── Step 5: 文末語尾の統一 ──────────────────────────────
    // answer フィールドのみ対象（title 等は整形しない）
    if (processed.answer && traits.formality > 0.5) {
      processed.answer = tuneFormality(
        processed.answer,
        traits.formality,
        voice.sentenceEndings,
      );
    }

    // ── Step 6: 税法免責事項 ─────────────────────────────────
    if (needsTaxDisclaimer(processed)) {
      processed.answer = (processed.answer ?? '') + TAX_DISCLAIMER;
      disclaimerAdded = true;
      appliedRules.push('rule_tax_law_disclaimer');
    }

    // ── Step 7: tax_comment にアラートプレフィックスを追加 ──
    if (processed.tax_comment && !processed.tax_comment.startsWith('⚠️') &&
        !processed.tax_comment.startsWith('📋') && !processed.tax_comment.startsWith('🔍')) {
      const prefix = pick(voice.alertPrefixes);
      if (prefix) {
        processed.tax_comment = `${prefix}\n${processed.tax_comment}`;
      }
    }

    return processed;
  });

  return {
    processedActions,
    appliedRules: [...new Set(appliedRules)], // 重複除去
    encouragementInjected,
    disclaimerAdded,
  };
};

// ─── Next.js Server Action ラッパー ─────────────────────────────

/**
 * Next.js 15 の Server Action として使用する場合のラッパー。
 * `'use server'` ディレクティブは呼び出し元ファイルに記述する。
 *
 * @example
 * ```ts
 * // app/actions/neo.ts
 * 'use server'
 * import { applySoulServerAction } from '@/soul/middleware'
 * export const processNeoResponse = applySoulServerAction;
 * ```
 */
export const applySoulServerAction = async (
  input: SoulMiddlewareInput,
): Promise<SoulMiddlewareOutput> => {
  // Server Action では非同期処理（DB fetch等）が入る想定
  // 現時点では同期処理をラップ
  return applySoul(input);
};

// ─── Vanilla JS 互換エクスポート ─────────────────────────────────

/**
 * gemini.js から呼び出せる CommonJS スタイルの互換エクスポート。
 * TypeScript のトランスパイル後に UMD/CJS で参照できる。
 *
 * @example (gemini.js 内)
 * ```js
 * const { applySoulVanilla } = window.NeoSoul;
 * const processed = applySoulVanilla(rawActions, userSoul);
 * const answer = processed[0]?.answer ?? '';
 * ```
 */
export const applySoulVanilla = (
  rawActions: GeminiIntentAction[],
  soul?: NeoSoul,
  context?: SoulContext,
): GeminiIntentAction[] => {
  const output = applySoul({ rawActions, soul, context });
  return output.processedActions;
};
