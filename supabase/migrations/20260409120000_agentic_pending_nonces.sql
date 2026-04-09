-- Agentic 承認フロー: サーバー発行 nonce のワンタイム消費（リプレイ・改ざん対策の一部）
-- HMAC 署名と組み合わせ、同一トークンでの二重実行を防ぐ。

CREATE TABLE IF NOT EXISTS public.agentic_pending_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_agentic_pending_nonces_expires
  ON public.agentic_pending_nonces (expires_at);

COMMENT ON TABLE public.agentic_pending_nonces IS
  'Agentic pendingActions 承認用 nonce。発行時に INSERT、承認実行時に consumed_at を立てる。';

ALTER TABLE public.agentic_pending_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agentic pending nonces"
  ON public.agentic_pending_nonces
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
