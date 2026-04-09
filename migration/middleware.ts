/**
 * middleware.ts（Next.js root middleware）
 * セッション更新 + 認証ルーティングガード
 *
 * ⚠️ 最重要の落とし穴:
 *   Next.js の Middleware はブラウザと同じ EdgeRuntime で動く。
 *   ここで行うべきことは「Cookie の refresh」のみ。
 *   DB クエリや重い処理は絶対に行わないこと（レイテンシが全ルートに影響する）。
 *
 * 認証チェックの仕組み:
 *   1. updateSession() が Cookie の Supabase トークンを確認・更新する
 *   2. 未認証ユーザーが (app) グループにアクセスしたら /login にリダイレクト
 *   3. 認証済みユーザーが /login にアクセスしたら /cockpit にリダイレクト
 */

import { createServerClient }                        from '@supabase/ssr';
import { NextResponse, type NextRequest }            from 'next/server';
import type { Database }                             from '@/lib/supabase/types';

// 認証不要の公開パス
const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback', '/api/health'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // ─── Supabase セッション更新 ──────────────────────────────────
  // ⚠️ この処理は全リクエストで実行する必要がある。
  //    省略するとアクセストークンが期限切れになっても更新されない。
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => request.cookies.getAll(),
        setAll:  (cookiesToSet) => {
          // リクエストとレスポンスの両方に Cookie をセット
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ⚠️ getUser() を使う。getSession() は JWT を検証しないため Middleware では不適切。
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // ─── ルーティングガード ──────────────────────────────────────
  if (!user && !isPublicPath) {
    // 未認証 → /login にリダイレクト（元のパスをクエリに保存）
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    // 認証済み → /cockpit にリダイレクト
    return NextResponse.redirect(new URL('/cockpit', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // API routes と静的ファイルは除外
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
