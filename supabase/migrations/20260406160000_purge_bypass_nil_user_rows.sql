-- Remove bypass-era rows tied to the nil UUID (no real auth user).
-- Runs in migration context (bypasses RLS). Order: activities first (FK safety), then projects.

DELETE FROM public.activities
WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid;

DELETE FROM public.projects
WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid;
