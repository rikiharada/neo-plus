/**
 * features/accounting-desk/accounting-types.ts
 * Ledger Desk 機能で共有する型定義（UI / サーバー共通）
 *
 * 純粋型定義ファイル — 'use client' / 'use server' なし
 * ランタイムコードを含まないこと。
 */

// ─── タブ / モード ────────────────────────────────────────────────

/** 左ペインのタブ */
export type DeskTab = 'csv' | 'documents';

/**
 * 書類読込タブの処理モード
 *   auto   — 「Neoに全部任せる」: Agentic Loop で自動仕分けまで実行（Step 2）
 *   guided — 「一緒に確認しながら」: 読み取り結果を Neo と 1 件ずつ確認（Step 2）
 */
export type ProcessingMode = 'auto' | 'guided';

// ─── OCR / 書類読み取り ───────────────────────────────────────────

/**
 * OCR で抽出した書類情報
 *
 * Step 1: フィールドは null（抽出未実装）
 * Step 2: Gemini Vision API / Document AI で実値が入る
 */
export interface OcrExtraction {
  /** 書類種別（例: 「領収書」「請求書」「見積書」） */
  documentType: string | null;
  /** 発行日（YYYY-MM-DD 形式） */
  date:         string | null;
  /** 発行元・取引先名 */
  issuer:       string | null;
  /** 推定勘定科目（例: 「旅費交通費」「消耗品費」） */
  accountTitle: string | null;
  /** 金額（税込、整数円） */
  amount:       number | null;
}

// ─── 月次サマリー ────────────────────────────────────────────────

/**
 * 左ペイン下部のサマリーカードに表示するデータ
 * サーバー側で計算してクライアントに渡す想定。
 */
export interface DeskMonthlySummary {
  /** 今月の経費合計（円） */
  totalExpense: number;
  /** 未処理件数（uploading / analyzing 状態のファイル数） */
  pendingCount: number;
}
