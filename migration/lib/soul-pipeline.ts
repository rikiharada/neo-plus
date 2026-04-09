/**
 * lib/soul-pipeline.ts
 * 統一 Soul ポストプロセッシング パイプライン
 *
 * 設計思想:
 *   すべての主要パス（チャット応答・収支登録メッセージ・提案生成・アラート）が
 *   必ずこのパイプラインを通る。Soul の適用を「後処理の一箇所」で統一することで、
 *   ①テスト容易性、②トレーサビリティ、③一貫したペルソナ を保証する。
 *
 * 呼び出し方:
 *   const result = await runSoulPipeline({
 *     raw:     "Geminiの生テキスト or アクション JSON",
 *     userId:  user.id,
 *     context: { todayEntryCount, lastEncouragementAt, ... },
 *   });
 *   return result.text;  // Soul 処理済みテキスト
 *
 * パイプライン 8 ステップ:
 *   1. 禁止フレーズ除去
 *   2. 行動ルール適用（behavior_rules の priority 順）
 *   3. 税務免責付加（カテゴリヒントがある場合）
 *   4. 励まし注入（確率 + インターバル制御）
 *   5. 丁寧度チューニング（formality trait）
 *   6. 長さ制御（max_length trait）
 *   7. TAX_DISCLAIMER 末尾付加（needsTaxDisclaimer の場合）
 *   8. アラートプレフィックス（重要な警告の場合）
 */

import { loadSoulServer, NEO_DEFAULT_SOUL, type NeoSoul } from '@/features/soul/server';

// ─── 定数 ────────────────────────────────────────────────────────

const TAX_DISCLAIMER =
  '※ これは参考情報です。正確な税務判断はお近くの税理士にご確認ください。';

const FORBIDDEN_PHRASES = [
  // AI が責任回避で言いがちな表現を削除
  'もちろんです、',
  'もちろん！',
  '承知しました、',
  '喜んでお手伝いします',
  '確かに、',
  // 英語混じりの不自然表現
  'Sure! ',
  'Certainly! ',
  'Of course! ',
] as const;

const ENCOURAGEMENT_MESSAGES = [
  'コツコツ記録できていますね。この調子で！',
  '記録を続けることが確定申告をラクにします。',
  '日々の記帳、お疲れ様です。',
  '小さな積み重ねが、大きな安心につながります。',
] as const;

const MIN_ENCOURAGEMENT_INTERVAL_MS = 3 * 60 * 1000; // 3分

// ─── 型定義 ──────────────────────────────────────────────────────

export interface SoulPipelineInput {
  /** Soul を適用したいテキスト（Gemini 生テキスト or メッセージ） */
  raw:       string;
  /** 認証ユーザー ID（null の場合はデフォルト Soul を使用） */
  userId:    string | null;
  /** パイプラインのコンテキスト情報 */
  context?:  SoulPipelineContext;
  /** Soul を外部から注入する場合（テスト・キャッシュ利用時） */
  soulOverride?: NeoSoul;
}

export interface SoulPipelineContext {
  /** 今日の収支エントリ数（励まし判定に使用） */
  todayEntryCount?:         number;
  /** 最後に励ましメッセージを出した時刻（ms epoch） */
  lastEncouragementAt?:     number;
  /** このメッセージに関連するカテゴリ（税務ヒント判定） */
  activityCategory?:        string;
  /** 税務免責を強制付加するか */
  forceTaxDisclaimer?:      boolean;
  /** アラートレベル（'none' | 'warn' | 'critical'） */
  alertLevel?:              'none' | 'warn' | 'critical';
}

export interface SoulPipelineOutput {
  /** Soul 処理済みテキスト */
  text:                    string;
  /** パイプラインのデバッグ情報 */
  debug: {
    soulUsed:              'user' | 'default' | 'override';
    stepsApplied:          string[];
    encouragementInjected: boolean;
    taxDisclaimerAdded:    boolean;
    forbiddenPhrasesRemoved: number;
  };
}

/** Gemini 失敗時の分類（runSoulPipelineForAiFailure 用） */
export type AiFailureVariant =
  | 'timeout'
  | 'network'
  | 'safety'
  | 'empty'
  | 'config'
  | 'generic';

const AI_FAILURE_RAW: Record<AiFailureVariant, string> = {
  timeout:
    '今の応答生成に時間がかかりすぎたようです。少し間を空けてから、もう一度お試しください。',
  network:
    'ちょっと接続が不安定みたい…。一息ついて、もう一度だけ送ってみようか？',
  safety:
    '安全フィルタの都合で、今回はその回答をお届けできませんでした。言い回しを変えてもう一度お試しください。',
  empty:
    '空の応答が返ってきました。脳の接続を確認し、もう一度お試しください。',
  config:
    'AI サービスの設定が未完了です。環境をご確認ください。',
  generic:
    '応答の生成に失敗しちゃったみたい。Neoはここにいるから、少し時間をおいてもう一度だけ試してみて。',
};

/**
 * Gemini 失敗後も必ず Soul パイプラインを通す（トーン統一・励まし注入）。
 * Server Action の `error` フィールドにそのまま載せられる。
 */
export async function runSoulPipelineForAiFailure(input: {
  userId:        string;
  soulOverride?: NeoSoul;
  variant:       AiFailureVariant;
}): Promise<SoulPipelineOutput> {
  const raw = AI_FAILURE_RAW[input.variant] ?? AI_FAILURE_RAW.generic;
  return runSoulPipeline({
    raw,
    userId:       input.userId,
    soulOverride: input.soulOverride,
    context:      { alertLevel: 'warn' },
  });
}

/**
 * チャット成功応答の最終処理（命名で「Gemini 後に必ず通す」意図を固定）。
 * 内部は runSoulPipeline と同一。
 */
export async function finalizeAssistantReplyAfterGemini(
  input: SoulPipelineInput,
): Promise<SoulPipelineOutput> {
  return runSoulPipeline(input);
}

// ─── カテゴリ → 税務ヒント辞書 ──────────────────────────────────

const TAX_CATEGORY_HINTS: Readonly<Record<string, string>> = {
  '交通費':       '交通費は事業目的に限り経費算入可能です（私用分は按分）。',
  '通信費':       '通信費は事業利用割合に応じて按分が必要です。',
  '消耗品費':     '10万円未満の備品は消耗品費として一括計上できます。',
  '外注費':       '外注費の支払い時は源泉徴収義務が発生する場合があります。',
  '接待交際費':   '接待交際費は業務関連性の立証が重要です（領収書に参加者・目的を記入）。',
  '広告宣伝費':   '広告費は原則全額損金算入できます。',
  '地代家賃':     '自宅兼事務所の場合は事業使用割合で按分計算が必要です。',
  '研修費':       '業務に直接関連する研修費は経費算入可能です。',
  '新聞図書費':   '業務関連の書籍・雑誌は経費算入できます。',
  '保険料':       '生命保険料は控除の対象になる場合があります（事業用途は経費）。',
};

// ─── メインパイプライン ──────────────────────────────────────────

/**
 * Soul ポストプロセッシング パイプラインを実行する。
 *
 * ⚠️ この関数はサーバー専用（process.env にアクセスするため）。
 *    Client Component から呼ぶ場合は Server Action を経由すること。
 */
export async function runSoulPipeline(
  input: SoulPipelineInput,
): Promise<SoulPipelineOutput> {
  const { raw, userId, context = {}, soulOverride } = input;

  // ─ Soul 取得 ─────────────────────────────────────────────────
  let soul: NeoSoul;
  let soulUsed: SoulPipelineOutput['debug']['soulUsed'];

  if (soulOverride) {
    soul     = soulOverride;
    soulUsed = 'override';
  } else {
    soul     = await loadSoulServer(userId);
    soulUsed = userId ? 'user' : 'default';
  }

  // ─ パイプライン実行 ─────────────────────────────────────────
  let text   = raw;
  const stepsApplied:  string[] = [];
  let encouragementInjected = false;
  let taxDisclaimerAdded    = false;
  let forbiddenPhrasesRemoved = 0;

  // Step 1: 禁止フレーズ除去
  const step1Result = _removeForbiddenPhrases(text);
  text = step1Result.text;
  forbiddenPhrasesRemoved = step1Result.count;
  if (step1Result.count > 0) stepsApplied.push('forbidden-phrases');

  // Step 2: 行動ルール適用
  const step2Result = _applyBehaviorRules(text, soul);
  text = step2Result.text;
  if (step2Result.applied) stepsApplied.push('behavior-rules');

  // Step 3: カテゴリ税務ヒント付加
  if (context.activityCategory && soul.traits.precision > 0.8) {
    const hint = TAX_CATEGORY_HINTS[context.activityCategory];
    if (hint) {
      text += `\n\n💡 ${hint}`;
      stepsApplied.push('tax-category-hint');
    }
  }

  // Step 4: 励まし注入
  const shouldEncourage = _shouldInjectEncouragement({
    traits:              soul.traits,
    todayEntryCount:     context.todayEntryCount ?? 0,
    lastEncouragementAt: context.lastEncouragementAt ?? 0,
  });
  if (shouldEncourage) {
    text += `\n\n${_pickRandom(ENCOURAGEMENT_MESSAGES)}`;
    encouragementInjected = true;
    stepsApplied.push('encouragement');
  }

  // Step 5: 丁寧度チューニング
  if (soul.traits.formality < 0.4) {
    // カジュアルモード: 句点をやや省く（実装は要件に応じて拡張）
    stepsApplied.push('formality-casual');
  }

  // Step 6: 長さ制御
  const step6Result = _applyLengthControl(text, soul.response_style.max_length);
  if (step6Result.truncated) {
    text = step6Result.text;
    stepsApplied.push('length-control');
  } else {
    text = step6Result.text;
  }

  // Step 7: TAX_DISCLAIMER 末尾付加
  const needsDisclaimer =
    context.forceTaxDisclaimer ||
    (soul.traits.precision > 0.8 && _containsTaxKeyword(text));

  if (needsDisclaimer) {
    text += `\n\n${TAX_DISCLAIMER}`;
    taxDisclaimerAdded = true;
    stepsApplied.push('tax-disclaimer');
  }

  // Step 8: アラートプレフィックス
  if (context.alertLevel === 'critical') {
    text = `🚨 重要: ${text}`;
    stepsApplied.push('alert-critical');
  } else if (context.alertLevel === 'warn') {
    text = `⚠️ ${text}`;
    stepsApplied.push('alert-warn');
  }

  return {
    text,
    debug: {
      soulUsed,
      stepsApplied,
      encouragementInjected,
      taxDisclaimerAdded,
      forbiddenPhrasesRemoved,
    },
  };
}

/**
 * 同期版パイプライン（Soul を外部から渡す場合のみ使用）。
 * テスト・Soul が既にロード済みの場合に使う。
 */
export function runSoulPipelineSync(
  input: Omit<SoulPipelineInput, 'userId'> & { soul: NeoSoul },
): SoulPipelineOutput {
  // 非同期 DB アクセスをスキップして同期実行
  const { raw, soul, context = {} } = input;

  let text = raw;
  const stepsApplied: string[] = [];
  let encouragementInjected = false;
  let taxDisclaimerAdded    = false;

  const step1Result = _removeForbiddenPhrases(text);
  text = step1Result.text;
  if (step1Result.count > 0) stepsApplied.push('forbidden-phrases');

  const step2Result = _applyBehaviorRules(text, soul);
  text = step2Result.text;
  if (step2Result.applied) stepsApplied.push('behavior-rules');

  if (context.activityCategory && soul.traits.precision > 0.8) {
    const hint = TAX_CATEGORY_HINTS[context.activityCategory];
    if (hint) { text += `\n\n💡 ${hint}`; stepsApplied.push('tax-category-hint'); }
  }

  const shouldEncourage = _shouldInjectEncouragement({
    traits: soul.traits,
    todayEntryCount: context.todayEntryCount ?? 0,
    lastEncouragementAt: context.lastEncouragementAt ?? 0,
  });
  if (shouldEncourage) {
    text += `\n\n${_pickRandom(ENCOURAGEMENT_MESSAGES)}`;
    encouragementInjected = true;
    stepsApplied.push('encouragement');
  }

  const step6Result = _applyLengthControl(text, soul.response_style.max_length);
  text = step6Result.text;
  if (step6Result.truncated) stepsApplied.push('length-control');

  if (context.forceTaxDisclaimer || (soul.traits.precision > 0.8 && _containsTaxKeyword(text))) {
    text += `\n\n${TAX_DISCLAIMER}`;
    taxDisclaimerAdded = true;
    stepsApplied.push('tax-disclaimer');
  }

  if (context.alertLevel === 'critical') { text = `🚨 重要: ${text}`; stepsApplied.push('alert-critical'); }
  else if (context.alertLevel === 'warn') { text = `⚠️ ${text}`; stepsApplied.push('alert-warn'); }

  return {
    text,
    debug: { soulUsed: 'override', stepsApplied, encouragementInjected, taxDisclaimerAdded, forbiddenPhrasesRemoved: step1Result.count },
  };
}

// ─── ステップ実装 ────────────────────────────────────────────────

function _removeForbiddenPhrases(text: string): { text: string; count: number } {
  let count = 0;
  let result = text;
  for (const phrase of FORBIDDEN_PHRASES) {
    if (result.includes(phrase)) {
      result = result.replaceAll(phrase, '');
      count++;
    }
  }
  return { text: result.trim(), count };
}

function _applyBehaviorRules(
  text:  string,
  soul:  NeoSoul,
): { text: string; applied: boolean } {
  let result = text;
  let applied = false;

  const rules = [...soul.behavior_rules].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (rule.action === 'append_disclaimer' && _containsTaxKeyword(text)) {
      // 重複付加を防ぐ
      if (!result.includes('税理士')) {
        result += `\n（税務判断については専門家にご相談ください）`;
        applied = true;
      }
    }
  }
  return { text: result, applied };
}

function _shouldInjectEncouragement(opts: {
  traits:              NeoSoul['traits'];
  todayEntryCount:     number;
  lastEncouragementAt: number;
}): boolean {
  const { traits, todayEntryCount, lastEncouragementAt } = opts;
  if (traits.encouragement < 0.5) return false;
  if (todayEntryCount < 1) return false;
  if (Date.now() - lastEncouragementAt < MIN_ENCOURAGEMENT_INTERVAL_MS) return false;
  // 確率: encouragement trait × 30%
  return Math.random() < traits.encouragement * 0.3;
}

function _applyLengthControl(
  text:       string,
  maxLength:  NeoSoul['response_style']['max_length'],
): { text: string; truncated: boolean } {
  const limits: Record<typeof maxLength, number> = {
    short:  150,
    medium: 400,
    long:   1200,
  };
  const limit = limits[maxLength];
  if (text.length <= limit) return { text, truncated: false };
  // 文節で切る（句点で切ることを優先）
  const truncated = text.slice(0, limit);
  const lastPunct = Math.max(truncated.lastIndexOf('。'), truncated.lastIndexOf('．'));
  const result = lastPunct > limit * 0.7
    ? truncated.slice(0, lastPunct + 1)
    : truncated + '…';
  return { text: result, truncated: true };
}

function _containsTaxKeyword(text: string): boolean {
  const keywords = ['税', '控除', '経費', '確定申告', '消費税', '源泉', '損金', '益金'];
  return keywords.some((k) => text.includes(k));
}

function _pickRandom<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
