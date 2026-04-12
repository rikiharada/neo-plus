#!/usr/bin/env node
/**
 * Agentic タグパースのスモーク検証（API 不要）。
 * 曖昧応答・明確応答・actions 付き・タグ欠落の代表パターンを確認する。
 *
 * 実行: node scripts/agentic-parse-smoke.mjs
 */

function parseAgenticGeminiResponse(text) {
  const goalMatch = text.match(/<goal>([\s\S]*?)<\/goal>/i);
  const goal = goalMatch ? goalMatch[1].trim() : undefined;

  const planMatch = text.match(/<plan>([\s\S]*?)<\/plan>/i);
  const planSummary = planMatch ? planMatch[1].trim() : undefined;

  const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
  const actionsMatch = text.match(/<actions>([\s\S]*?)<\/actions>/i);

  let rawReply = replyMatch
    ? replyMatch[1].trim()
    : text
        .replace(/<goal>[\s\S]*?<\/goal>/gi, '')
        .replace(/<plan>[\s\S]*?<\/plan>/gi, '')
        .replace(/<actions>[\s\S]*?<\/actions>/gi, '')
        .trim();

  let actions = [];
  if (actionsMatch) {
    try {
      const parsedActions = JSON.parse(actionsMatch[1].trim());
      const arr = Array.isArray(parsedActions) ? parsedActions : [parsedActions];
      actions = arr.map((a) => ({ ...a, autoExecute: false }));
    } catch {
      console.warn('[warn] actions JSON parse failed');
    }
  }

  return { goal, planSummary, rawReply, actions };
}

function assert(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${name}`, detail);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok: ${name}`);
  return true;
}

// 1) 提案のみ（曖昧入力想定）
const ambiguous = `
<goal>今月の支出を把握し、記録に安心感を持ちたい</goal>
<plan>
1. チャットで対象の期間を教えてもらう
2. 気になる支出の種類を一緒に整理する
3. 金額が固まったら登録案を出す（領収書はDriveフォームへ）
</plan>
<reply>一緒にこの段取りで進めていきましょうか。まずは期間からそろえていきましょう。</reply>
`;
const r1 = parseAgenticGeminiResponse(ambiguous);
assert('ambiguous has goal', Boolean(r1.goal?.includes('支出')));
assert('ambiguous has plan steps', Boolean(r1.planSummary?.includes('1.')));
assert('ambiguous has reply', r1.rawReply.includes('進めていきましょう'));
assert('ambiguous no actions', r1.actions.length === 0);

// 2) 明確指示 + actions
const clear = `
<goal>コーヒー代を記録する</goal>
<plan>1. 内容を確認 2. 承認後に登録</plan>
<reply>この内容でよければ「実行して」と送ってください。</reply>
<actions>[{"type":"INSERT_ACTIVITY","payload":{"type":"expense","category":"接待交際費","title":"コーヒー代","amount":400,"date":"2026-04-05"}}]</actions>
`;
const r2 = parseAgenticGeminiResponse(clear);
assert('clear has one action', r2.actions.length === 1);
assert('clear action type', r2.actions[0].type === 'INSERT_ACTIVITY');
assert('clear amount', r2.actions[0].payload.amount === 400);

// 3) reply 欠落時のフォールバック（後方互換）
const fallback = '<goal>G</goal><plan>P</plan>plain body only';
const r3 = parseAgenticGeminiResponse(fallback);
assert('fallback strips tags', r3.rawReply.includes('plain body'));

// 4) Drive 言及が plan に含まれるケース
const drivePlan = `<plan>1. 画面上のDriveフォームから領収書を保存する\n2. 緑のバナーで金額を確認して記帳する</plan><reply>Driveへ誘導します。</reply>`;
const r4 = parseAgenticGeminiResponse(drivePlan);
assert('drive plan preserved', r4.planSummary?.includes('Drive'));

console.log(
  process.exitCode ? '\nagentic-parse-smoke: 失敗' : '\nagentic-parse-smoke: すべて成功',
);
