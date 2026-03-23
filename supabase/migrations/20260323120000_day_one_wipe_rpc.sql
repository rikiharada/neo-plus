-- 任意: クライアントの DELETE が RLS で失敗する環境向けの補助（auth.uid() の行＋自分の project 配下）
-- 適用後: await supabase.rpc('day_one_wipe_user_data_via_owner')
-- 知識系テーブルは触れない。

CREATE OR REPLACE FUNCTION public.day_one_wipe_user_data_via_owner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  a1 int; a2 int; d1 int; t1 int; p1 int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  DELETE FROM public.activities WHERE user_id = uid;
  GET DIAGNOSTICS a1 = ROW_COUNT;

  DELETE FROM public.documents WHERE user_id = uid;
  GET DIAGNOSTICS d1 = ROW_COUNT;

  DELETE FROM public.transactions WHERE user_id = uid;
  GET DIAGNOSTICS t1 = ROW_COUNT;

  DELETE FROM public.activities
  WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = uid);
  GET DIAGNOSTICS a2 = ROW_COUNT;

  DELETE FROM public.documents
  WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = uid);

  DELETE FROM public.transactions
  WHERE project_id IN (SELECT id FROM public.projects WHERE user_id = uid);

  DELETE FROM public.projects WHERE user_id = uid;
  GET DIAGNOSTICS p1 = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', jsonb_build_object(
      'activities_by_user_id', a1,
      'activities_by_project_owner', a2,
      'documents', d1,
      'transactions', t1,
      'projects', p1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.day_one_wipe_user_data_via_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.day_one_wipe_user_data_via_owner() TO authenticated;
