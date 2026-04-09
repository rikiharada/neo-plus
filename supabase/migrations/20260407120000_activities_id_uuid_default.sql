-- activities.id が uuid の環境で DEFAULT gen_random_uuid() を保証（手動 id 省略時の duplicate / 型不整合を防ぐ）
-- 列が uuid でない既存 DB では何もしない（別途型移行が必要）

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'activities'
          AND c.column_name = 'id'
          AND c.data_type = 'uuid'
    ) THEN
        ALTER TABLE public.activities
            ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END
$$;

COMMENT ON COLUMN public.activities.id IS 'UUID PK; default gen_random_uuid() when not supplied';
