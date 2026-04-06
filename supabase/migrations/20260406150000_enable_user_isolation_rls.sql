-- supabase/migrations/20260406150000_enable_user_isolation_rls.sql

-- 1. Ensure user_id column exists on documents if it doesn't already
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'user_id') THEN
        ALTER TABLE public.documents ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Backfill user_id (Transition existing local rows if user is logged in natively)
-- Note: You should only run these if you are transitioning data that you know belongs to auth.uid()
UPDATE public.projects SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE public.activities SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE public.documents SET user_id = auth.uid() WHERE user_id IS NULL;

-- 3. Enable RLS on core user data tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies for projects
DROP POLICY IF EXISTS "Users can manage their own projects" ON public.projects;
CREATE POLICY "Users can manage their own projects" 
ON public.projects FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Create Policies for activities
DROP POLICY IF EXISTS "Users can manage their own activities" ON public.activities;
CREATE POLICY "Users can manage their own activities" 
ON public.activities FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 6. Create Policies for documents
DROP POLICY IF EXISTS "Users can manage their own documents" ON public.documents;
CREATE POLICY "Users can manage their own documents" 
ON public.documents FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 7. Ensure files table exists and has user_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'files') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'files' AND column_name = 'user_id') THEN
            ALTER TABLE public.files ADD COLUMN user_id UUID REFERENCES auth.users(id);
        END IF;
    END IF;
END $$;

-- 8. Backfill files user_id and enable RLS
UPDATE public.files SET user_id = auth.uid() WHERE user_id IS NULL;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own files" ON public.files;
CREATE POLICY "Users can manage their own files" 
ON public.files FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
