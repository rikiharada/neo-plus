/**
 * lib/drive-user-access.ts
 * Google Drive 連携 — サーバー専用（トークン取得・更新・Neo フォルダ解決）
 *
 * Zero-Server 原則: ファイル実体は Drive。Supabase には user_integrations のトークンと
 * drive_file_pointers のメタデータのみ。
 *
 * ─── セッション / 例外の落とし穴（設計メモ）────────────────────────
 * 1. `createServerActionClient()` は Cookie の JWT を使う。リフレッシュ中にセッションが
 *    切れた場合、以降の `.update()` が RLS で失敗しうる → `SESSION_ERROR` として扱い、
 *    インメモリだけ有効なトークンを返さない（下記で REFRESH_FAILED / FOLDER_ERROR に寄せる）。
 * 2. `refreshAccessToken` 成功後、DB への書き戻しに失敗したら **成功扱いにしない**
 *    （次リクエストで古い access_token が読まれ、Drive API が 401 になりやすい）。
 * 3. `ensureNeoFolderExists` が Drive 上でフォルダ作成に成功したが `folder_id` の
 *    DB 保存に失敗した場合、次回はフォルダ検索で同じ名前のフォルダが見つかる想定。
 *    完全に中途半端な状態は稀だが、ユーザーには再接続・再試行を案内する。
 * 4. アップロードは `features/drive/actions.ts` で、Drive 成功後に DB 失敗時は
 *    `deleteDriveFile` で孤立ファイルをベストエフォート削除（完全保証ではない）。
 */

import {
  ensureNeoFolderExists,
  isTokenExpiringSoon,
  refreshAccessToken,
} from '@/lib/google-drive';
import { createServerActionClient } from '@/lib/supabase/server';
import type { UserIntegrationRow } from '@/lib/supabase/types';

export type DriveAccessResult =
  | { ok: true; accessToken: string; folderId: string | null }
  | {
      ok: false;
      code:
        | 'NOT_LINKED'
        | 'REFRESH_FAILED'
        | 'FOLDER_ERROR'
        | 'SESSION_ERROR';
    };

/**
 * ユーザーの Google Drive アクセストークンを取得（必要なら refresh）。
 * folder_id が未設定なら Neo 専用フォルダを作成して DB に保存。
 */
export async function getValidGoogleDriveAccessForUser(
  userId: string,
): Promise<DriveAccessResult> {
  try {
    const supabase = await createServerActionClient();

    const { data: row, error } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
      .maybeSingle();

    if (error || !row) {
      if (error) {
        console.error('[drive-user-access] load integration:', error.code, error.message);
      }
      return { ok: false, code: 'NOT_LINKED' };
    }

    const integration = row as UserIntegrationRow;

    let accessToken = integration.access_token;
    let expiryDate  = integration.expiry_date;

    if (isTokenExpiringSoon(expiryDate)) {
      if (!integration.refresh_token) {
        return { ok: false, code: 'REFRESH_FAILED' };
      }
      const refreshed = await refreshAccessToken(integration.refresh_token);
      if (!refreshed.ok || !refreshed.tokens) {
        return { ok: false, code: 'REFRESH_FAILED' };
      }
      accessToken = refreshed.tokens.access_token;
      expiryDate  = refreshed.tokens.expiry_date;

      const { error: upErr } = await supabase
        .from('user_integrations')
        .update({
          access_token: accessToken,
          expiry_date:  expiryDate,
          updated_at:   new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('provider', 'google_drive');

      if (upErr) {
        console.error(
          '[drive-user-access] Failed to persist refreshed token:',
          upErr.code,
          upErr.message,
        );
        // インメモリだけ新トークンを返さない（不整合・次回401を避ける）
        return { ok: false, code: 'REFRESH_FAILED' };
      }
    }

    let folderId = integration.folder_id;

    if (!folderId) {
      const folder = await ensureNeoFolderExists(accessToken);
      if (!folder.ok || !folder.folderId) {
        return { ok: false, code: 'FOLDER_ERROR' };
      }
      folderId = folder.folderId;

      const { error: folderErr } = await supabase
        .from('user_integrations')
        .update({
          folder_id:  folderId,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('provider', 'google_drive');

      if (folderErr) {
        console.error(
          '[drive-user-access] Failed to persist folder_id:',
          folderErr.code,
          folderErr.message,
        );
        return { ok: false, code: 'FOLDER_ERROR' };
      }
    }

    return { ok: true, accessToken, folderId };
  } catch (e) {
    console.error('[drive-user-access] Unexpected error:', e);
    return { ok: false, code: 'SESSION_ERROR' };
  }
}
