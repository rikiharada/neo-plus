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

export interface HandleInstructionResult {
  ok:       boolean;
  reply?:   string;
  actions?: ParsedAction[];
  agent?:   HandleInstructionAgentMeta;
  _debug?:  Record<string, unknown>;
  error?:   string;
  code?:    string;
}
