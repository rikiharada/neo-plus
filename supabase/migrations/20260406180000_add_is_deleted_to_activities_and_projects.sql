-- PGRST204: mockDB と整合する論理削除フラグ（クライアントが INSERT/UPDATE で参照）
-- activities / projects に is_deleted を追加（未存在時のみ）

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.is_deleted IS 'Logical delete; default false';
COMMENT ON COLUMN public.projects.is_deleted IS 'Logical delete; default false';
