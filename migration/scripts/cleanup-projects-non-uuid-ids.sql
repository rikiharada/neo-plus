-- Optional maintenance: delete rows whose `id` does not look like a UUID.
-- If `id` is native UUID, every row passes the regex (no-op). Use when `id` was TEXT/BIGINT legacy.

DELETE FROM public.projects
WHERE id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Review with SELECT before DELETE:
-- SELECT id, name, created_at FROM public.projects
-- WHERE id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
