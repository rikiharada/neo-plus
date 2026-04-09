/**
 * Agentic Loop — 共有型（features/chat と lib から参照）
 *
 * ReAct 風の軽量ループ: Goal → Plan → Tool 選択 → Confirm → Execute
 */

/** ツール（Server Action 相当）の宣言。実実行はユーザー承認後のみ。 */
export interface ParsedAction {
  type:
    | 'INSERT_ACTIVITY'
    | 'UPDATE_ACTIVITY'
    | 'DELETE_ACTIVITY'
    | 'SHOW_SUMMARY'
    | 'NAVIGATE'
    | 'UNKNOWN';
  payload:      Record<string, unknown>;
  autoExecute?: boolean;
}

/**
 * UI / デバッグ用のループ位相（厳密な状態機械ではなく、ユーザーへの透明性のため）
 */
export type AgenticLoopPhase =
  /** 雑談・照会のみ、またはツール未使用 */
  | 'conversational'
  /** <goal> または <plan> があり、まだ <actions> がない／軽い提案 */
  | 'goal_and_plan'
  /** <actions> があり、ユーザーの「実行して」を待っている */
  | 'awaiting_confirm'
  /** 保留アクションを実行し終えた直後 */
  | 'executed';

export interface HandleInstructionAgentMeta {
  /** 現在のループ位相 */
  loopPhase: AgenticLoopPhase;
  /** `<goal>...</goal>` の要約（任意） */
  goalSummary?: string;
  /** `<plan>...</plan>` の要約（任意） */
  planSummary?: string;
  /** 後方互換: 旧コード・UI 用 */
  phase?: 'plan' | 'reply' | 'confirm_executed';
  awaitingConfirmation?: boolean;
  pendingActionCount?: number;
  /**
   * 承認実行時にクライアントへ返す HMAC（改ざん検知用）。
   * pendingApprovalNonce / IssuedAt とセットで `pendingActionsToConfirm` と同梱する。
   */
  pendingApprovalToken?: string;
  pendingApprovalNonce?: string;
  pendingApprovalIssuedAt?: number;
}
