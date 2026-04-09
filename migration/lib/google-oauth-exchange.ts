/**
 * lib/google-oauth-exchange.ts
 * Google OAuth authorization code → tokens（google-auth-library）
 *
 * Route Handler のみから呼ぶ。Client Secret はサーバー専用。
 */

import { OAuth2Client } from 'google-auth-library';

export interface ExchangedGoogleTokens {
  access_token?:  string | null;
  refresh_token?: string | null;
  expiry_date?:   number | null;
  scope?:         string;
}

/**
 * Google から返却された `code` を Access / Refresh Token に交換する。
 */
export async function exchangeGoogleAuthorizationCode(
  code: string,
): Promise<{ ok: true; tokens: ExchangedGoogleTokens } | { ok: false; error: string }> {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, error: 'Google OAuth の環境変数が設定されていません' };
  }

  try {
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const r      = await client.getToken(code);
    const t      = r.tokens;
    return {
      ok: true,
      tokens: {
        access_token:  t.access_token ?? null,
        refresh_token: t.refresh_token ?? null,
        expiry_date:   t.expiry_date ?? null,
        scope:         t.scope ?? '',
      },
    };
  } catch (e) {
    console.error('[google-oauth-exchange] getToken failed:', e);
    return { ok: false, error: 'トークンの交換に失敗しました' };
  }
}
