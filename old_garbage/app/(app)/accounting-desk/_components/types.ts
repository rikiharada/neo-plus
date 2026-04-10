/**
 * app/(app)/accounting-desk/_components/types.ts
 * Ledger Desk 全体で共有する型定義
 *
 * 純粋型定義ファイル — 'use client' / 'use server' なし
 */

import type { FileAnalysisResult } from '@/features/accounting-desk/file-analyzer';
import type { OcrExtraction }      from '@/features/accounting-desk/accounting-types';

// ─── ファイルエントリのライフサイクル ────────────────────────────

/**
 * ファイルドロップから Neo 第一声表示まで:
 *   idle → uploading → analyzing → done
 *                              → error
 */
export type DeskFileStatus = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

export interface DeskFileEntry {
  /** ブラウザ生成の一意 ID（crypto.randomUUID） */
  id:            string;
  fileName:      string;
  fileSizeKb:    number;
  status:        DeskFileStatus;

  /** ブラウザ側で解析したサマリー（Drive アップロード前に取得） */
  analysis?:     FileAnalysisResult;

  /** Drive アップロード成功後 */
  driveFileId?:  string;
  driveWebLink?: string;

  /** Soul Pipeline が生成した Neo の第一声 */
  neoMessage?:   string;

  /** エラー時のメッセージ */
  errorMessage?: string;

  /** ファイルが追加された時刻 */
  addedAt:       number; // ms epoch
}

// ─── デスクの全体状態 ────────────────────────────────────────────

export interface DeskState {
  files:      DeskFileEntry[];
  selectedId: string | null;
  /** Neo チャットエリアのメッセージ履歴（デスク専用 — チャットページとは独立） */
  messages:   DeskMessage[];
}

export interface DeskMessage {
  id:        string;
  role:      'assistant' | 'user';
  content:   string;
  timestamp: string; // ISO 8601
  /** どのファイルエントリに紐づくか（省略可） */
  fileId?:   string;
  /**
   * OCR 抽出結果カード（Neoバブル内に表示）
   * Step 1: null（未実装）
   * Step 2: Gemini Vision で実値が入る
   */
  ocrCard?:  OcrExtraction;
}
