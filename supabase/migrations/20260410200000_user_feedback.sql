-- ベータテスター向けフィードバック（CEO / 開発者レビュー用）
-- RLS: 自分の行のみ INSERT。SELECT は本人のみ（CEO は Dashboard / service_role で参照）

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('bug', 'idea', 'other')),
  message     text NOT NULL,
  page_path   text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_user_id_idx ON public.user_feedback (user_id);
CREATE INDEX IF NOT EXISTS user_feedback_created_at_idx ON public.user_feedback (created_at DESC);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_feedback_insert_own"
  ON public.user_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_feedback_select_own"
  ON public.user_feedback FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_feedback IS 'Neo+ ベータのバグ報告・感想。本文は運営が Supabase から参照。';
