/**
 * lib/drive-integration-status.ts
 * Server Component / Server Action から Google Drive 連携状態を取得する
 */

import { createServerComponentClient } from '@/lib/supabase/server';

export async function getGoogleDriveLinkedForUser(userId: string): Promise<boolean> {
  const supabase = await createServerComponentClient();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .maybeSingle();

  if (error) {
    console.warn('[drive-integration-status]', error.message);
    return false;
  }
  return !!data;
}
