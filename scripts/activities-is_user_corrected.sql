-- activities.is_user_corrected — 列の確認と（必要なら）追加
-- Supabase: SQL Editor で実行

-- 1) 列が存在するか確認
SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'activities'
  AND column_name  = 'is_user_corrected';

-- 結果が 0 行なら、コードから除外している現状の DB と一致（fetch の 500 回避済み）。

-- 2) 列が必要な場合のみ: 安全に追加（既にあれば何もしない）
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS is_user_corrected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.is_user_corrected IS
  'ユーザーが手動で修正した行かどうか（アプリで使うなら types と actions に列を復活させる）';
