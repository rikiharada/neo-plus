/**
 * GET /api/auth/google/callback
 * Google OAuth コールバック — google-auth-library で code → token 交換
 *
 * 1. state と Cookie を照合（CSRF）
 * 2. Supabase セッションで user_id を取得
 * 3. exchangeGoogleAuthorizationCode（OAuth2Client）
 * 4. user_integrations に保存
 *    ⚠️ 本番環境では access_token / refresh_token カラムの暗号化（pgsodium / Vault）を強く推奨
 * 5. ensureNeoFolderExists で Neo 専用フォルダ → folder_id を DB 更新
 * 6. ダッシュボードへリダイレクト
 *
 * ─── 手動確認メモ ─────────────────────────────────────────────
 * - 正常: Google 同意後 `/cockpit?drive=connected` に戻り、コックピットでフラッシュ表示
 * - 返却する `NextResponse` は **upsert 成功後の 1 箇所だけ**（早期 return は別レスポンス）
 * - token リフレッシュの自動経路はここではなく upload 時の getValidGoogleDriveAccessForUser
 *   （テスト手順は lib/drive-user-access.ts 先頭コメント参照）
 * - ⚠️ Route Handler 内では `NextResponse.next()` は使わない（Next.js 非対応）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { exchangeGoogleAuthorizationCode } from '@/lib/google-oauth-exchange';
import { ensureNeoFolderExists, GOOGLE_DRIVE_SCOPES } from '@/lib/google-drive';

function redirectWithError(request: NextRequest, reason: string) {
  const path = process.env.NEO_OAUTH_SUCCESS_PATH ?? '/cockpit';
  return NextResponse.redirect(
    new URL(`${path}?drive_error=${encodeURIComponent(reason)}`, request.url),
  );
}

export async function GET(request: NextRequest) {
  const url   = request.nextUrl;
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const gErr  = url.searchParams.get('error');

  const successPath = process.env.NEO_OAUTH_SUCCESS_PATH ?? '/cockpit';

  if (gErr) {
    return redirectWithError(request, gErr);
  }
  if (!code || !state) {
    return redirectWithError(request, 'missing_code');
  }

  const stored = request.cookies.get('neo_google_oauth_state')?.value;
  if (!stored || stored !== state) {
    return redirectWithError(request, 'invalid_state');
  }

  /**
   * Supabase の setAll が Cookie を載せる Response。
   * 成功 URL はここで生成するが、**このオブジェクトを返すのは upsert 成功後だけ**。
   */
  let response = NextResponse.redirect(
    new URL(`${successPath}?drive=connected`, request.url),
  );
  const supabase = createRouteHandlerClient(request, response);

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.redirect(new URL('/login?error=oauth_session', request.url));
  }

  const exchanged = await exchangeGoogleAuthorizationCode(code);
  if (!exchanged.ok || !exchanged.tokens.access_token) {
    return redirectWithError(request, 'token_exchange');
  }

  const t            = exchanged.tokens;
  const expiryDate   = t.expiry_date ?? Date.now() + 3600 * 1000;
  const scopeJoined  = t.scope && t.scope.length > 0
    ? t.scope
    : GOOGLE_DRIVE_SCOPES.join(' ');

  const folder = await ensureNeoFolderExists(t.access_token);
  if (!folder.ok || !folder.folderId) {
    return redirectWithError(request, 'folder');
  }

  const { error: upErr } = await supabase.from('user_integrations').upsert(
    {
      user_id:       user.id,
      provider:      'google_drive',
      access_token:  t.access_token,
      refresh_token: t.refresh_token ?? null,
      expiry_date:   expiryDate,
      scope:         scopeJoined,
      folder_id:     folder.folderId,
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  );

  if (upErr) {
    console.error('[google/callback] user_integrations upsert:', upErr);
    return redirectWithError(request, 'db');
  }

  response.cookies.delete('neo_google_oauth_state');
  return response;
}
