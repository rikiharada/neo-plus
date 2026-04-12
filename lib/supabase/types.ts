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

/**
 * 収支1行（activities テーブル）— UUID 移行フェーズ4（`features/activities/actions.ts` の INSERT 鉄壁と対になる型）
 *
 * **これで二重運用期間が安全になる**ためのルール（アプリ側）:
 * - 画面上の「この行の ID」は常に `id_uuid`（文字列）。`activityCanonicalId(row)` で統一して取る。
 * - `id`（number）は DB 列名の都合で legacy 相当。React の key や Server Action の引数に使わない。
 *
 * **メイン ID（正規）**: `id_uuid`（UUID 文字列）
 * - 新規作成後の ID、React の `key`、Map のキー、更新・削除の照会は、`id_uuid` / `activityCanonicalId(row)` に集約する。
 *
 * **legacy_id（レガシー）**: プロパティ名は DB 列に合わせて `id`（number）のまま
 * - DB の serial / int4。UUID 移行完了後に列ごと削除予定（TODO）。
 * - 新規コードでは数値の `id` を「正しい ID」とみなさない。移行中のフォールバック照会に限る。
 */
export interface ActivityRow {
  /**
   * **legacy_id** — DB 列名 `id`（int4 / serial）。
   * UUID 移行完了後に削除予定。照会・表示の主キーに使わないこと。
   */
  id:                number;
  /**
   * **メイン ID（正規）** — `id_uuid`（NOT NULL UUID）。
   * `activityCanonicalId(row)` の返り値と同一。
   */
  id_uuid:           string;
  user_id:           string;
  /**
   * Project reference: same string as `projects.id_uuid`. DB column name is `project_id`.
   */
  project_id:        string | null;
  type:              'expense' | 'income' | 'transfer';
  category:          string;
  title:             string;
  amount:            number;
  date:              string;         // ISO 8601
  is_bookkeeping:    boolean;
  is_deleted:        boolean;
  receipt_url:       string | null;
  tags:              string[] | null;
  tax_comment:       string | null;
  inferred_tax_rate: string | null;
  created_at:        string;
  updated_at:        string;
}

/**
 * 収支行の**アプリ標準 ID**（= 正規の `id_uuid`）を返す。
 *
 * **可能な限りここ経由で ID を取る**（一覧・詳細・フォーム hidden・楽観的更新のキーなど）。
 * 直接 `row.id_uuid` を読んでもよいが、プロジェクト全体で「ID はこれ」と決めると移行が楽になる。
 *
 * - React の `key`・`Map` のキー・ログ・デバッグ表示に使う。`row.id`（legacy int）は使わない。
 * - Server Action の成功時は `ActionResult` の判別共用体で **`id_uuid` が必須**。`id` は同じ値のレガシー別名。
 * - 関連する UI・チャット・フォームでは、可能な限りこの関数で ID を取る（フェーズ4の指針）。
 */
export function activityCanonicalId(row: Pick<ActivityRow, 'id_uuid'>): string {
  return row.id_uuid;
}

/**
 * projects 行 — activities と同じ二重運用（legacy `id` +正規 `id_uuid`）
 *
 * - **正規 ID**: `id_uuid`（URL・`activities.project_id`・React の key はここ）
 * - **legacy**: `id`（整数 PK）。移行完了後に列削除予定なら TODO で整理
 */
export interface ProjectRow {
  /**
   * **legacy_id** — DB の整数 PK（serial / bigint 等）。
   * URLやリンクの主キーに使わない（`id_uuid` を使う）。
   */
  id:               number;
  /**
   * **メイン ID** — `id_uuid`。`projectCanonicalId(row)` と同じ値。
   */
  id_uuid:          string;
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
  is_deleted:       boolean;
}

/**
 * プロジェクト行の**アプリ標準 ID**（= `id_uuid`）。
 * 一覧・詳細 URL・フォーム・`activities.project_id` では可能な限りこれを使う。
 */
export function projectCanonicalId(row: Pick<ProjectRow, 'id_uuid'>): string {
  return row.id_uuid;
}

/**
 * `fetchProjects` などで返す projects 行。
 * DB に `id_uuid` 列がある前提で SELECT に含め、**常に string の id_uuid** を持つ。
 */
export type ProjectsFetchRow = ProjectRow;

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
        /** INSERT 時は `id`（serial）も `id_uuid`（default）も送らない */
        Insert: Omit<ActivityRow, 'id' | 'id_uuid' | 'created_at' | 'updated_at'>;
        /** PK 列は更新不可 */
        Update: Partial<
          Omit<ActivityRow, 'id' | 'id_uuid' | 'user_id' | 'created_at'>
        >;
        Relationships: [];
      };
      projects: {
        Row:    ProjectRow;
        /** INSERT 時は整数 `id` も `id_uuid` も送らない（DB の serial / DEFAULT に任せる） */
        Insert: Omit<ProjectRow, 'id' | 'id_uuid' | 'created_at'>;
        Update: Partial<
          Omit<ProjectRow, 'id' | 'id_uuid' | 'user_id' | 'created_at'>
        >;
        Relationships: [];
      };
      souls: {
        Row:    SoulRow;
        Insert: Omit<SoulRow, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SoulRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      user_integrations: {
        Row:    UserIntegrationRow;
        Insert: Omit<UserIntegrationRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<
          Omit<UserIntegrationRow, 'id' | 'user_id' | 'provider' | 'created_at'>
        >;
        Relationships: [];
      };
      drive_file_pointers: {
        Row:    DriveFilePointerRow;
        Insert: Omit<DriveFilePointerRow, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DriveFilePointerRow, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
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
        Relationships: [];
      };
      user_feedback: {
        Row:    UserFeedbackRow;
        Insert: Omit<UserFeedbackRow, 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Omit<UserFeedbackRow, 'id' | 'user_id' | 'created_at'>>;
        Relationships: [];
      };
    };
    /** Supabase `GenericSchema` 互換（`Record<string, never>`だと postgrest-js で Schema が never になる） */
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
