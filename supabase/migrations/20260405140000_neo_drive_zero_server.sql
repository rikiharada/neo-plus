-- Neo+ Zero-Server: Google Drive 第一ストレージ + Supabase はポインタのみ
-- トークンは本番では暗号化カラム or Vault 利用を推奨（ここではテキスト + RLS）

-- ─── OAuth 連携（Google Drive） ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'google_drive',
  access_token    text NOT NULL,
  refresh_token   text,
  expiry_date     bigint NOT NULL,
  scope           text NOT NULL DEFAULT '',
  folder_id       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_integrations_user_id_idx ON public.user_integrations (user_id);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_integrations_select_own"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_integrations_insert_own"
  ON public.user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_integrations_update_own"
  ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "user_integrations_delete_own"
  ON public.user_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Drive ファイルポインタ（バイナリは保存しない） ───────────────

CREATE TABLE IF NOT EXISTS public.drive_file_pointers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  drive_file_id      text NOT NULL,
  web_view_link      text,
  original_filename  text NOT NULL,
  mime_type          text NOT NULL,
  size_bytes         bigint,
  kind               text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('receipt', 'invoice', 'site_photo', 'other')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_file_pointers_user_id_idx ON public.drive_file_pointers (user_id);
CREATE INDEX IF NOT EXISTS drive_file_pointers_created_at_idx ON public.drive_file_pointers (created_at DESC);

ALTER TABLE public.drive_file_pointers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drive_file_pointers_select_own"
  ON public.drive_file_pointers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "drive_file_pointers_insert_own"
  ON public.drive_file_pointers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drive_file_pointers_update_own"
  ON public.drive_file_pointers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "drive_file_pointers_delete_own"
  ON public.drive_file_pointers FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.drive_file_pointers IS 'Google Drive 上のファイル ID のみ保持。実体はユーザーの Drive。';
