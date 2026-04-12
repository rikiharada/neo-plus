/**
 * Chat-related types shared by Client and Server (no 'use server').
 * Client components import types only from here so the actions module is not pulled into the client bundle.
 */

import type {
  ParsedAction,
  HandleInstructionAgentMeta,
} from '@/lib/agentic-types';

export type {
  ParsedAction,
  HandleInstructionAgentMeta,
  AgenticLoopPhase,
} from '@/lib/agentic-types';

export interface ChatMessage {
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string;
  goalSummary?: string;
  planSummary?: string;
}

/** Optional client navigation after handleInstruction (e.g. Ledger Desk). */
export interface HandleInstructionClientNavigation {
  href: string;
  /** デバッグ・ログ用の任意ラベル */
  reason?: string;
}

export interface HandleInstructionResult {
  ok:       boolean;
  reply?:   string;
  actions?: ParsedAction[];
  agent?:   HandleInstructionAgentMeta;
  /** 付与時はクライアントが `router.push(href)` してよい（例: Ledger Desk） */
  clientNavigation?: HandleInstructionClientNavigation;
  /**
   * Agentic 実行で作成されたプロジェクトの UUID（あれば）。
   * CockpitQuickCapture が `/projects/{id}` へ誘導するために使う。
   */
  executedProjectId?: string;
  /** Agentic 実行で登録した経費の件数（UI フィードバック用） */
  executedActivityCount?: number;
  _debug?:  Record<string, unknown>;
  error?:   string;
  code?:    string;
}
