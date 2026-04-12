/**
 * Gemini 応答から Agentic セグメント（goal / plan / reply / actions）を抽出する。
 * 純粋関数 — テストしやすい。
 */

import type { ParsedAction } from '@/lib/agentic-types';

export interface AgenticParseResult {
  goal?: string;
  planSummary?: string;
  rawReply: string;
  actions: ParsedAction[];
}

/**
 * Intent routing 入口 — Gemini 応答テキストを構造化データへ。
 * @see parseAgenticGeminiResponse
 */
export function parseInputToData(text: string): AgenticParseResult {
  return parseAgenticGeminiResponse(text);
}

/**
 * `<goal>` `<plan>` `<reply>` `<actions>` をパース。
 * `<reply>` が無い場合は、タグを剥がした残りを本文とみなす（後方互換）。
 */
export function parseAgenticGeminiResponse(text: string): AgenticParseResult {
  const goalMatch = text.match(/<goal>([\s\S]*?)<\/goal>/i);
  const goal       = goalMatch ? goalMatch[1].trim() : undefined;

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

  let actions: ParsedAction[] = [];
  if (actionsMatch) {
    try {
      const parsedActions = JSON.parse(actionsMatch[1].trim());
      const arr = Array.isArray(parsedActions) ? parsedActions : [parsedActions];
      actions = arr.map((raw: unknown) => {
        const a = raw as ParsedAction;
        const t = (raw as Record<string, unknown>)['type'];
        const rawType = typeof t === 'string' ? t : '';
        const type: ParsedAction['type'] =
          rawType === 'CREATE_PROJECT' ? 'INSERT_PROJECT' : a.type;
        return {
          ...a,
          type,
          autoExecute: false,
        };
      });
    } catch {
      console.warn('[agentic-parser] Failed to parse <actions> JSON');
    }
  }

  return { goal, planSummary, rawReply, actions };
}
