-- Neo+ 知識系 vs ユーザーデータ系の分離
-- 適用前に既存ポリシーと競合しないか Supabase ダッシュボードで確認してください。

-- ── 知識系（AI キャッシュ・埋め込み・ルールストア）────────────────────────────
CREATE TABLE IF NOT EXISTS public.neo_knowledge (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
    namespace text NOT NULL DEFAULT 'personal',
    key text NOT NULL,
    body jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neo_knowledge_user_ns ON public.neo_knowledge (user_id, namespace);

CREATE TABLE IF NOT EXISTS public.semantic_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    cache_key text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, cache_key)
);

CREATE TABLE IF NOT EXISTS public.vector_embeddings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    source_ref text,
    embedding jsonb,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ── データ系: user_id 列（既存行は NULL のまま移行可能）──────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id);
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id);

-- transactions（transactionHandler.js が使用）— 未作成環境向け
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    project_id uuid,
    amount numeric NOT NULL DEFAULT 0,
    date date NOT NULL DEFAULT (CURRENT_DATE),
    memo text,
    category text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON public.transactions (project_id);

-- 既存 transactions テーブルがある場合は user_id を追加
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id);

-- ── RLS: 知識系（自分の行のみ操作）──────────────────────────────────────────
ALTER TABLE public.neo_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vector_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS neo_knowledge_select ON public.neo_knowledge;
CREATE POLICY neo_knowledge_select ON public.neo_knowledge
    FOR SELECT TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS neo_knowledge_mutate_own ON public.neo_knowledge;
CREATE POLICY neo_knowledge_mutate_own ON public.neo_knowledge
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS semantic_cache_own ON public.semantic_cache;
CREATE POLICY semantic_cache_own ON public.semantic_cache
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vector_embeddings_own ON public.vector_embeddings;
CREATE POLICY vector_embeddings_own ON public.vector_embeddings
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- データ系（自分の user_id の行のみ。レガシー NULL は移行完了まで暫定で許可）
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_own ON public.projects;
CREATE POLICY projects_own ON public.projects
    FOR ALL TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid())
    WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS activities_own ON public.activities;
CREATE POLICY activities_own ON public.activities
    FOR ALL TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid())
    WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS documents_own ON public.documents;
CREATE POLICY documents_own ON public.documents
    FOR ALL TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid())
    WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS transactions_own ON public.transactions;
CREATE POLICY transactions_own ON public.transactions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ── クライアントからの「知識のみリセット」（ユーザーデータは触らない）────────
CREATE OR REPLACE FUNCTION public.reset_neo_knowledge_for_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.semantic_cache WHERE user_id = auth.uid();
    DELETE FROM public.vector_embeddings WHERE user_id = auth.uid();
    DELETE FROM public.neo_knowledge WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.reset_neo_knowledge_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_neo_knowledge_for_current_user() TO authenticated;

COMMENT ON TABLE public.neo_knowledge IS 'Neo 知識ストア（ユーザー別・グローバルは user_id NULL 想定）';
COMMENT ON TABLE public.semantic_cache IS '意味キャッシュ（ユーザー別）';
COMMENT ON TABLE public.vector_embeddings IS 'ベクトルキャッシュ（JSON 配列等、ユーザー別）';
