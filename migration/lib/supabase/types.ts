/**
 * lib/supabase/types.ts
 * Supabase Database 型定義（`supabase gen types typescript` の出力を想定）
 *
 * 実運用では以下コマンドで自動生成する:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts
 */

export type Json =
  | string | number | boolean | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── テーブル行型 ──────────────────────────────────────────────────

export interface ActivityRow {
  id:                string;         // UUID (pg_crypto gen_random_uuid())
  user_id:           string;
  project_id:        string | null;
  type:              'expense' | 'income' | 'transfer';
  category:          string;
  title:             string;
  amount:            number;
  date:              string;         // ISO 8601
  is_bookkeeping:    boolean;
  is_user_corrected: boolean;
  is_deleted:        boolean;
  receipt_url:       string | null;
  tags:              string[] | null;
  tax_comment:       string | null;
  inferred_tax_rate: string | null;
  created_at:        string;
  updated_at:        string;
}

export interface ProjectRow {
  id:               string;          // UUID
  user_id:          string;
  name:             string;
  category:         string;
  color:            string;
  status:           'active' | 'completed' | 'archived';
  location:         string | null;
  revenue:          number;
  has_unpaid:       boolean;
  note:             string | null;
  client_name:      string | null;
  payment_deadline: string | null;
  bank_info:        string | null;
  currency:         string;
  last_updated:     string | null;
  created_at:       string;
}

export interface SoulRow {
  id:             string;
  version:        string;
  persona:        Json;
  traits:         Json;
  voice:          Json;
  response_style: Json;
  behavior_rules: Json;
  is_active:      boolean;
  user_id:        string | null;
  created_at:     string;
  updated_at:     string;
}

/** Google OAuth 連携（Drive 等）— トークンは本番では暗号化推奨 */
export interface UserIntegrationRow {
  id:             string;
  user_id:        string;
  provider:       'google_drive';
  access_token:   string;
  refresh_token:  string | null;
  expiry_date:    number;
  scope:          string;
  folder_id:      string | null;
  created_at:     string;
  updated_at:     string;
}

/** ベータフィードバック（バグ・感想） */
export interface UserFeedbackRow {
  id:          string;
  user_id:     string;
  kind:        'bug' | 'idea' | 'other';
  message:     string;
  page_path:   string | null;
  user_agent:  string | null;
  created_at:  string;
}

/** Agentic 承認 nonce（ワンタイム消費） */
export interface AgenticPendingNonceRow {
  id:          string;
  user_id:     string;
  nonce:       string;
  expires_at:  string;
  consumed_at: string | null;
  created_at:  string;
}

/** Drive 上のファイルへのポインタのみ（バイナリは保存しない） */
export interface DriveFilePointerRow {
  id:                 string;
  user_id:            string;
  drive_file_id:      string;
  web_view_link:      string | null;
  original_filename:  string;
  mime_type:          string;
  size_bytes:         number | null;
  kind:               'receipt' | 'invoice' | 'site_photo' | 'other';
  created_at:         string;
}

// ─── Database 統合型 ───────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      activities: {
        Row:    ActivityRow;
        Insert: Omit<ActivityRow, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ActivityRow, 'id' | 'user_id' | 'created_at'>>;
      };
      projects: {
        Row:    ProjectRow;
        Insert: Omit<ProjectRow, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<ProjectRow, 'id' | 'user_id' | 'created_at'>>;
      };
      souls: {
        Row:    SoulRow;
        Insert: Omit<SoulRow, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SoulRow, 'id' | 'created_at'>>;
      };
      user_integrations: {
        Row:    UserIntegrationRow;
        Insert: Omit<UserIntegrationRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<
          Omit<UserIntegrationRow, 'id' | 'user_id' | 'provider' | 'created_at'>
        >;
      };
      drive_file_pointers: {
        Row:    DriveFilePointerRow;
        Insert: Omit<DriveFilePointerRow, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DriveFilePointerRow, 'id' | 'user_id' | 'created_at'>>;
      };
      agentic_pending_nonces: {
        Row:    AgenticPendingNonceRow;
        Insert: Omit<
          AgenticPendingNonceRow,
          'id' | 'created_at' | 'consumed_at'
        > & {
          id?:           string;
          consumed_at?: string | null;
        };
        Update: Partial<
          Pick<AgenticPendingNonceRow, 'expires_at' | 'consumed_at'>
        >;
      };
      user_feedback: {
        Row:    UserFeedbackRow;
        Insert: Omit<UserFeedbackRow, 'id' | 'created_at'> & {
          id?: string;
        };
        Update: never;
      };
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
    Enums:     Record<string, never>;
  };
}
