/**
 * GET /api/auth/google
 * Google Drive OAuth 開始 — ログイン済みユーザーのみ（Middleware）
 *
 * CSRF: state を httpOnly Cookie に保存し、callback で照合する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthUrl } from '@/lib/google-drive';

export async function GET(request: NextRequest) {
  try {
    const state = crypto.randomUUID();
    const url   = getGoogleOAuthUrl(state);
    const res   = NextResponse.redirect(url);
    res.cookies.set('neo_google_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   600,
    });
    return res;
  } catch (e) {
    console.error('[api/auth/google]', e);
    return NextResponse.redirect(
      new URL('/cockpit?drive_error=config', request.url),
    );
  }
}
