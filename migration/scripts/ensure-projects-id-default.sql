-- Run once in Supabase SQL Editor if `projects.id` has no default.
-- Lets inserts omit `id` so PostgreSQL assigns gen_random_uuid().

ALTER TABLE public.projects
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
