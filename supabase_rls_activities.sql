-- Activities Table RLS Setup
-- Run this in your Supabase SQL Editor

-- 1. Enable Row Level Security
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 2. Create Policy for Insert/Update/Delete (Users can only manage their own activities)
CREATE POLICY "Users can fully manage their own activities"
ON public.activities
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Optional: Ensure projects table also has the same RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can fully manage their own projects"
ON public.projects
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
