-- =============================================================================
-- projects.id_uuid — activities と同様の二重運用（legacy `id` 列はそのまま残す）
-- =============================================================================
-- 前提: `projects.id` が整数型（serial / bigint 等）。`id` 列自体を UUID に変えずに移行する場合。
-- 実行前にバックアップ。Staging で検証してから本番へ。
--
-- やること（初心者向け）:
--   1. 新しい列 `id_uuid` を足す（まだ無ければ）
--   2. 既存の各行にランダム UUID を入れる（バックフィル）
--   3. 重複がないように UNIQUE 制約
--   4. NOT NULL + DEFAULT で「これから入る行」も必ず UUID になるようにする
-- =============================================================================

BEGIN;

-- (1) 列を追加（既にある場合はスキップ）
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS id_uuid uuid;

-- (2) まだ NULL の行だけ UUID を埋める（既存の数値 id は書き換えない）
UPDATE public.projects
SET id_uuid = gen_random_uuid()
WHERE id_uuid IS NULL;

-- (3) アプリの「正規 ID」として一意であることを保証
CREATE UNIQUE INDEX IF NOT EXISTS projects_id_uuid_uq
  ON public.projects (id_uuid);

-- (4) NULL を許さない
ALTER TABLE public.projects
  ALTER COLUMN id_uuid SET NOT NULL;

-- (5) INSERT で id_uuid を省略すると DEFAULT が効く
ALTER TABLE public.projects
  ALTER COLUMN id_uuid SET DEFAULT gen_random_uuid();

COMMIT;

-- =============================================================================
-- 確認用（任意）: 列ができたか見る
-- =============================================================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'projects'
-- ORDER BY ordinal_position;
