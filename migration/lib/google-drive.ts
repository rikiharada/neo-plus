/**
 * lib/google-drive.ts
 * Google Drive 統合 — 将来の第一ストレージ化に向けた準備
 *
 * アーキテクチャ設計:
 *   現在:   Supabase Storage（プライマリ）
 *   将来:   Google Drive（ユーザー個人の Drive にファイルを保存）
 *
 * OAuth フロー:
 *   1. ユーザーが「Google Drive を連携」ボタンを押す
 *   2. /api/auth/google/route.ts → getGoogleOAuthUrl() で認証 URL を生成
 *   3. Google の同意画面でユーザーが許可
 *   4. /api/auth/google/callback/route.ts → exchangeCodeForTokens() でトークン取得
 *   5. tokens を Supabase の user_integrations テーブルに暗号化して保存
 *   6. 以降の API 呼び出しは getGoogleDriveClient() を使う
 *
 * ⚠️ 重要な注意事項:
 *   - refresh_token は最初の認証時のみ返される（access_type=offline + prompt=consent）
 *   - access_token は1時間で期限切れ → refreshAccessToken() で更新
 *   - Google Drive API は googleapis npm パッケージを使う（要インストール）
 *   - Client Secret は絶対に NEXT_PUBLIC_ に入れない
 *   - ユーザーのファイルへのアクセスは最小権限スコープで行う
 *
 * 必要な環境変数:
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...  ← NEXT_PUBLIC_ 禁止
 *   GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
 *
 * 必要な npm パッケージ（本番使用時にインストール）:
 *   npm install googleapis
 */

// ─── 型定義 ─────────────────────────────────────────────────────

export interface GoogleOAuthTokens {
  access_token:  string;
  refresh_token: string | null;
  expiry_date:   number;         // ms epoch
  token_type:    'Bearer';
  scope:         string;
}

export interface GoogleDriveFile {
  id:          string;
  name:        string;
  mimeType:    string;
  webViewLink: string;
  size?:       string;           // バイト数（文字列）
  createdTime: string;           // ISO 8601
  modifiedTime: string;
}

/** Drive API 失敗の大まかな分類（Soul 文言・ログ用） */
export type DriveUploadErrorClass =
  | 'auth_or_permission'
  | 'bad_request'
  | 'rate_limit'
  | 'unknown';

export interface GoogleDriveUploadResult {
  ok:           boolean;
  fileId?:      string;
  webViewLink?: string;
  error?:       string;
  /** HTTP ステータス（失敗時） */
  httpStatus?:  number;
  /** 失敗の分類 */
  errorClass?:  DriveUploadErrorClass;
}

export interface GoogleDriveListResult {
  ok:     boolean;
  files?: GoogleDriveFile[];
  error?: string;
}

// ─── スコープ定義 ────────────────────────────────────────────────

/**
 * 最小権限の原則に従ったスコープ設定。
 *
 * ⚠️ drive.file のみを要求する（drive 全体へのアクセスは要求しない）:
 *   - drive       → ユーザーの全ファイルに読み書き可能（過剰）
 *   - drive.file  → このアプリが作成したファイルのみ（推奨）
 *   - drive.readonly → 読み取り専用（必要に応じて追加）
 */
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  // 'https://www.googleapis.com/auth/drive.readonly',  // 読み取りが必要な場合に追加
] as const;

// ─── OAuth URL 生成 ──────────────────────────────────────────────

/**
 * Google OAuth 認証 URL を生成する。
 * /api/auth/google/route.ts から呼ぶ。
 *
 * @param state  CSRF 対策用のランダムな文字列（Server 側で生成・検証）
 */
export function getGoogleOAuthUrl(state: string): string {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('Google OAuth の環境変数が設定されていません（GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI）');
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         GOOGLE_DRIVE_SCOPES.join(' '),
    access_type:   'offline',    // refresh_token を取得するために必須
    prompt:        'consent',    // 毎回同意画面を表示（refresh_token 再発行のため）
    state,
    include_granted_scopes: 'true',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ─── トークン交換 ────────────────────────────────────────────────

/**
 * Authorization Code を Access Token + Refresh Token に交換する。
 * /api/auth/google/callback/route.ts から呼ぶ。
 *
 * @param code    Google から返された認証コード
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<{ ok: boolean; tokens?: GoogleOAuthTokens; error?: string }> {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, error: 'Google OAuth の環境変数が設定されていません' };
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[GoogleDrive] Token exchange error:', err);
      return { ok: false, error: 'トークンの取得に失敗しました' };
    }

    const json = await res.json();
    const tokens: GoogleOAuthTokens = {
      access_token:  json.access_token,
      refresh_token: json.refresh_token ?? null,
      expiry_date:   Date.now() + (json.expires_in ?? 3600) * 1000,
      token_type:    'Bearer',
      scope:         json.scope ?? '',
    };

    // ⚠️ refresh_token が null の場合:
    //    既に一度 OAuth を完了しており、Google が refresh_token を再発行しなかった。
    //    access_type=offline + prompt=consent を指定していれば通常は取得できる。
    if (!tokens.refresh_token) {
      console.warn('[GoogleDrive] refresh_token is null. Check OAuth params.');
    }

    return { ok: true, tokens };
  } catch (err) {
    console.error('[GoogleDrive] exchangeCodeForTokens error:', err);
    return { ok: false, error: 'ネットワークエラーが発生しました' };
  }
}

// ─── トークン更新 ────────────────────────────────────────────────

/**
 * Access Token を Refresh Token で更新する。
 * access_token の expiry_date が近い場合に呼ぶ。
 *
 * @param refreshToken  保存済みの refresh_token
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ ok: boolean; tokens?: Pick<GoogleOAuthTokens, 'access_token' | 'expiry_date'>; error?: string }> {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Google OAuth の環境変数が設定されていません' };
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      return { ok: false, error: 'トークンの更新に失敗しました' };
    }

    const json = await res.json();
    return {
      ok:     true,
      tokens: {
        access_token: json.access_token,
        expiry_date:  Date.now() + (json.expires_in ?? 3600) * 1000,
      },
    };
  } catch (err) {
    console.error('[GoogleDrive] refreshAccessToken error:', err);
    return { ok: false, error: 'ネットワークエラーが発生しました' };
  }
}

// ─── Drive API ラッパー ──────────────────────────────────────────

/**
 * ファイルをアップロードする（領収書 / 添付ファイル用）。
 *
 * @param accessToken  有効な access_token
 * @param file         アップロードするファイル
 * @param folderId     保存先のフォルダ ID（null の場合はルート）
 */
export async function uploadFileToDrive(
  accessToken: string,
  file:        { name: string; mimeType: string; buffer: Buffer },
  folderId?:   string | null,
): Promise<GoogleDriveUploadResult> {
  try {
    // multipart/form-data でメタデータとファイルを一緒に送る
    const boundary = '-------neo_plus_boundary';
    const metadata = JSON.stringify({
      name:    file.name,
      parents: folderId ? [folderId] : [],
    });

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
      file.buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!res.ok) {
      const status = res.status;
      const err    = await res.json().catch(() => ({}));
      console.error('[GoogleDrive] Upload error:', status, err);

      let errorClass: DriveUploadErrorClass = 'unknown';
      if (status === 401 || status === 403) {
        errorClass = 'auth_or_permission';
      } else if (status === 400) {
        errorClass = 'bad_request';
      } else if (status === 429) {
        errorClass = 'rate_limit';
      }

      return {
        ok:         false,
        error:      'ファイルのアップロードに失敗しました',
        httpStatus: status,
        errorClass,
      };
    }

    const json = await res.json();
    return { ok: true, fileId: json.id, webViewLink: json.webViewLink };
  } catch (err) {
    console.error('[GoogleDrive] uploadFileToDrive error:', err);
    return { ok: false, error: 'ネットワークエラーが発生しました' };
  }
}

/**
 * アップロード直後に DB 失敗したときのベストエフォート削除（孤立ファイル対策）
 */
export async function deleteDriveFile(
  accessToken: string,
  fileId:      string,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      console.warn('[GoogleDrive] deleteDriveFile failed:', res.status);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[GoogleDrive] deleteDriveFile error:', e);
    return { ok: false };
  }
}

/**
 * Neo+ 専用フォルダを Drive に作成する（初回連携時に呼ぶ）。
 * 既に存在する場合は既存フォルダの ID を返す。
 *
 * @param accessToken  有効な access_token
 */
export async function ensureNeoFolderExists(
  accessToken: string,
): Promise<{ ok: boolean; folderId?: string; error?: string }> {
  const FOLDER_NAME = 'Neo+ 領収書・資料';

  try {
    // 既存フォルダを検索
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      )}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!searchRes.ok) {
      return { ok: false, error: 'フォルダの検索に失敗しました' };
    }

    const searchJson = await searchRes.json();
    if (searchJson.files?.length > 0) {
      return { ok: true, folderId: searchJson.files[0].id };
    }

    // 存在しない場合は作成
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name:     FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createRes.ok) {
      return { ok: false, error: 'フォルダの作成に失敗しました' };
    }

    const createJson = await createRes.json();
    return { ok: true, folderId: createJson.id };
  } catch (err) {
    console.error('[GoogleDrive] ensureNeoFolderExists error:', err);
    return { ok: false, error: 'ネットワークエラーが発生しました' };
  }
}

// ─── トークン有効期限チェック ────────────────────────────────────

/**
 * Access Token が5分以内に期限切れになるかチェックする。
 * true の場合は refreshAccessToken() を呼ぶ。
 */
export function isTokenExpiringSoon(expiryDate: number): boolean {
  const BUFFER_MS = 5 * 60 * 1000; // 5分
  return Date.now() + BUFFER_MS >= expiryDate;
}

// ─── DB スキーマ参考 ─────────────────────────────────────────────

/**
 * user_integrations テーブルのスキーマ（Supabase マイグレーション用）:
 *
 * ```sql
 * CREATE TABLE user_integrations (
 *   id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   provider         text NOT NULL,              -- 'google_drive'
 *   access_token     text NOT NULL,              -- 暗号化推奨（pgsodium）
 *   refresh_token    text,                       -- 暗号化推奨
 *   expiry_date      bigint NOT NULL,            -- ms epoch
 *   scope            text NOT NULL,
 *   folder_id        text,                       -- Neo+ フォルダの Drive ID
 *   created_at       timestamptz DEFAULT now(),
 *   updated_at       timestamptz DEFAULT now(),
 *   UNIQUE (user_id, provider)
 * );
 *
 * -- RLS
 * ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "users can manage own integrations"
 *   ON user_integrations FOR ALL
 *   USING (auth.uid() = user_id);
 * ```
 */
export type UserIntegrationRow = {
  id:            string;
  user_id:       string;
  provider:      'google_drive';
  access_token:  string;
  refresh_token: string | null;
  expiry_date:   number;
  scope:         string;
  folder_id:     string | null;
  created_at:    string;
  updated_at:    string;
};
