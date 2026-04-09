/**
 * lib/supabase/server.ts
 * @supabase/ssr — サーバー専用クライアント
 *
 * ⚠️ このファイルは Server Components / Server Actions / Route Handlers のみで使う。
 *    Client Components では lib/supabase/client.ts を使うこと。
 *
 * RLS が auth.uid() == user_id で動作するには Cookie から JWT を正しく読む必要がある。
 * createServerClient がそれを担保する。
 *
 * セキュリティ設計:
 *   1. getUser()  → JWT を Supabase サーバーで検証（信頼できる）
 *   2. getSession() → Cookie の値をそのまま信頼（検証なし → 使わない）
 *   3. requireAuth() → 未認証は UNAUTHORIZED をスロー（Server Actions で必須）
 *   4. requireAuthWithRole() → ロールベースアクセス制御（将来拡張用）
 */

import { createServerClient }   from '@supabase/ssr';
import { cookies }              from 'next/headers';
import type { NextRequest }     from 'next/server';
import type { NextResponse }    from 'next/server';
import type { Database }        from './types';
import type { User }            from '@supabase/supabase-js';

// ─── Server Component / Route Handler 用 ──────────────────────────

/**
 * 読み取り専用の Server Component クライアント。
 * Cookie の書き込みは行わない（onAuthStateChange を呼ばない）。
 *
 * @example
 * ```ts
 * // app/(app)/cockpit/page.tsx
 * const supabase = await createServerComponentClient();
 * const { data } = await supabase.from('activities').select('*');
 * ```
 */
export const createServerComponentClient = async () => {
  // Next.js 15: cookies() は async
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Server Components は Cookie を書けないので setAll は no-op
        setAll: () => {},
      },
    },
  );
};

// ─── Server Action 用 ─────────────────────────────────────────────

/**
 * Server Action 専用クライアント。
 * セッションの refresh が必要な場合に Cookie を書き込む。
 *
 * ⚠️ 落とし穴:
 *   - Server Action は `'use server'` ファイルにまとめて定義する
 *   - Route Handler は Response オブジェクトに Cookie をセットする必要があるため
 *     このクライアントとは別に createRouteHandlerClient を使う
 *
 * @example
 * ```ts
 * // features/activities/actions.ts
 * 'use server'
 * const supabase = await createServerActionClient();
 * const { data: { user } } = await supabase.auth.getUser();
 * if (!user) throw new Error('UNAUTHORIZED');
 * ```
 */
export const createServerActionClient = async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // Server Actions では cookies().set() が使える
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Middleware が refresh を担うためここでの失敗は許容
          }
        },
      },
    },
  );
};

/**
 * Route Handler 専用: `NextResponse` に Cookie を載せる（リダイレクト応答でも refresh 可能）
 *
 * @example
 * ```ts
 * let response = NextResponse.redirect(new URL('/cockpit', request.url));
 * const supabase = createRouteHandlerClient(request, response);
 * const { data: { user } } = await supabase.auth.getUser();
 * return response;
 * ```
 */
export const createRouteHandlerClient = (
  request: NextRequest,
  response: NextResponse,
) => {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
};

// ─── 認証済みユーザー取得ヘルパー ─────────────────────────────────

/**
 * 現在の認証ユーザーを取得する。未認証は null を返す（例外スローしない）。
 * auth.getUser() は getSession() より信頼性が高い（JWT の検証を行う）。
 *
 * ⚠️ 落とし穴:
 *   getSession() はサーバー側でトークンを検証せず、Cookie の値をそのまま信頼する。
 *   セキュアな操作（INSERT/UPDATE）は必ず getUser() を使うこと。
 */
export const getAuthenticatedUser = async () => {
  const supabase = await createServerActionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
};

/**
 * 認証必須のガード。未認証は Error('UNAUTHORIZED') をスロー。
 * Server Actions の先頭で呼ぶことで RLS と二重の保護を提供する。
 *
 * ⚠️ 実装詳細:
 *   1. createServerActionClient() で Cookie から JWT を取得
 *   2. supabase.auth.getUser() → Supabase Auth サーバーで JWT を検証
 *      （Cookie 改ざんや期限切れトークンを検出できる）
 *   3. エラー / null → Error('UNAUTHORIZED') をスロー
 *   4. Next.js の Server Action エラーハンドリングが UNAUTHORIZED を受け取り
 *      Client に伝播（ログインページへリダイレクト）
 *
 * セキュリティノート:
 *   - RLS （Row Level Security）が DB 側で user_id を保護する
 *   - requireAuth() はコード側の二重保護（Defense in Depth）
 *   - 両方を組み合わせることで「コードバグ」と「DB 設定漏れ」の両方を防ぐ
 *
 * @example
 * ```ts
 * // features/activities/actions.ts
 * 'use server'
 * export async function insertActivity(input: unknown) {
 *   const user = await requireAuth();  // ← 先頭で必ず呼ぶ
 *   // ... user.id は信頼できる値
 * }
 * ```
 */
export const requireAuth = async (): Promise<User> => {
  const user = await getAuthenticatedUser();
  if (!user) {
    // ⚠️ エラーメッセージに詳細を含めない（情報漏洩防止）
    const err = new Error('UNAUTHORIZED') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
};

/**
 * ロールベースアクセス制御（将来拡張用）。
 * user_metadata または専用の roles テーブルでロール管理する場合に使う。
 *
 * @example
 * ```ts
 * const user = await requireAuthWithRole('admin');
 * ```
 */
export const requireAuthWithRole = async (
  role: string,
): Promise<User> => {
  const user = await requireAuth();
  const userRole = user.app_metadata?.role as string | undefined;

  if (userRole !== role) {
    const err = new Error('FORBIDDEN') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  return user;
};

/**
 * Server Action のエラーを Client 向けのレスポンスに変換するヘルパー。
 *
 * @example
 * ```ts
 * try {
 *   const user = await requireAuth();
 *   // ...
 * } catch (err) {
 *   return handleServerActionError(err);
 * }
 * ```
 */
export function handleServerActionError(
  err: unknown,
): { ok: false; error: string; code?: string } {
  if (err instanceof Error) {
    if (err.message === 'UNAUTHORIZED') {
      return {
        ok:    false,
        error: 'この操作にはログインが必要です。Neoと一緒に、また記録を始めましょう。',
        code:  'UNAUTHORIZED',
      };
    }
    if (err.message === 'RATE_LIMITED') {
      return {
        ok:    false,
        error:
          '少しだけリクエストが多いようです。一杯深呼吸して、少し待ってからもう一度お試しください。',
        code:  'RATE_LIMITED',
      };
    }
    if (err.message === 'FORBIDDEN') {
      return {
        ok:    false,
        error: 'この操作は今の権限では難しいみたい。必要なら設定を見直して、また声をかけてね。',
        code:  'FORBIDDEN',
      };
    }
  }
  // 予期しないエラーは詳細を返さない（スタックトレース漏洩防止）
  console.error('[ServerAction] Unexpected error:', err);
  return {
    ok:    false,
    error:
      '一瞬の揺らぎがありました。Neoはここにいます。少し時間をおいて、もう一度お試しください。',
    code: 'INTERNAL_ERROR',
  };
}
