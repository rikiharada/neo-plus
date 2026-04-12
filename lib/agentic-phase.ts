/**
 * パース結果から UI 向けループ位相を決定する。
 */

import type { AgenticLoopPhase } from '@/lib/agentic-types';
import type { AgenticParseResult } from '@/lib/agentic-parser';

export function resolveLoopPhaseForReply(parsed: AgenticParseResult): AgenticLoopPhase {
  const needsConfirm = parsed.actions.some((a) => !(a.autoExecute ?? false));
  if (needsConfirm) {
    return 'awaiting_confirm';
  }
  if (parsed.goal?.trim() || parsed.planSummary?.trim()) {
    return 'goal_and_plan';
  }
  return 'conversational';
}
