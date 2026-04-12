/**
 * app/(auth)/login/_components/AuthForm.tsx
 * ログイン / サインアップ切り替えフォーム（Client Component）
 *
 * ⚠️ 'use client' が必要（フォームの状態管理、エラー表示、パネル切り替え）
 *
 * 仕様:
 *   - ログインパネルとサインアップパネルをクロスフェードで切り替える
 *   - メールアドレス + パスワード認証（Supabase Auth）
 *   - サインアップ: パスワード確認 + 利用規約同意チェック
 *   - 成功後: redirectTo があればそこへ、なければ / へ
 */

'use client';

import {
  useState,
  useTransition,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import { useRouter }            from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { APP_HOME_HREF } from '@/components/app-nav-config';

// ─── 型定義 ─────────────────────────────────────────────────────

type Panel = 'login' | 'signup';

interface AuthFormProps {
  redirectTo?: string;
}

// ─── エラーメッセージ日本語マッピング ────────────────────────────

const SUPABASE_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials':   'メールアドレスまたはパスワードが正しくありません',
  'Email not confirmed':         'メールアドレスの確認が完了していません。届いたメールを確認してください',
  'User already registered':     'このメールアドレスは既に登録されています',
  'Password should be at least 6 characters': 'パスワードは6文字以上にしてください',
  'Signup requires a valid password': '有効なパスワードを入力してください',
  'Unable to validate email address: invalid format': 'メールアドレスの形式が正しくありません',
};

function _translateError(message: string): string {
  for (const [key, ja] of Object.entries(SUPABASE_ERROR_MAP)) {
    if (message.includes(key)) return ja;
  }
  return message;
}

// ─── コンポーネント ──────────────────────────────────────────────

export function AuthForm({ redirectTo }: AuthFormProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [panel,      setPanel]      = useState<Panel>('login');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [pwConfirm,  setPwConfirm]  = useState('');
  const [consented,  setConsented]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending,  startTransition] = useTransition();

  // ─ ログイン処理 ─────────────────────────────────────────────

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    startTransition(async () => {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim(),
        password,
      });

      if (authError) {
        setError(_translateError(authError.message));
        return;
      }

      // ログイン成功 → リダイレクト
      router.push(redirectTo ?? APP_HOME_HREF);
      router.refresh(); // Middleware に認証情報を認識させる
    });
  }

  // ─ サインアップ処理 ──────────────────────────────────────────

  function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // バリデーション
    if (!email.trim() || !password || !pwConfirm) {
      setError('すべての項目を入力してください');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください');
      return;
    }
    if (password !== pwConfirm) {
      setError('パスワードが一致しません');
      return;
    }
    if (!consented) {
      setError('利用規約への同意が必要です');
      return;
    }

    startTransition(async () => {
      const { error: authError } = await supabase.auth.signUp({
        email:    email.trim(),
        password,
        options:  {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(_translateError(authError.message));
        return;
      }

      // 成功 → 確認メール送信済みメッセージを表示
      setSuccessMsg(
        `${email.trim()} に確認メールを送りました。メール内のリンクをクリックしてログインを完了してください。`,
      );
      // フォームリセット
      setPassword('');
      setPwConfirm('');
      setConsented(false);
      // 4秒後にログインパネルへ
      setTimeout(() => {
        setSuccessMsg(null);
        setPanel('login');
      }, 4000);
    });
  }

  // ─ パネル切り替え ───────────────────────────────────────────

  function switchTo(p: Panel) {
    setError(null);
    setSuccessMsg(null);
    setPanel(p);
  }

  // ─ レンダリング ────────────────────────────────────────────────

  return (
    <div className="auth-panels-stage">

      {/* ─── ログインパネル ─── */}
      <div
        className={['auth-panel', panel !== 'login' ? 'auth-panel--hidden' : ''].join(' ')}
        aria-hidden={panel !== 'login'}
      >
        <h1 className="auth-panel-title">ログイン</h1>

        <form onSubmit={handleLogin} noValidate className="auth-form">
          <div className="auth-field">
            <label htmlFor="login-email" className="auth-label">メールアドレス</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              disabled={isPending}
              className="auth-input"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">パスワード</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={isPending}
              className="auth-input"
              required
            />
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="auth-submit-btn"
          >
            {isPending ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <p className="auth-switch-text">
          アカウントをお持ちでない方は{' '}
          <button
            type="button"
            onClick={() => switchTo('signup')}
            className="auth-link"
          >
            新規登録
          </button>
        </p>
      </div>

      {/* ─── サインアップパネル ─── */}
      <div
        className={['auth-panel', 'auth-panel--signup', panel !== 'signup' ? 'auth-panel--hidden' : ''].join(' ')}
        aria-hidden={panel !== 'signup'}
      >
        <h1 className="auth-panel-title">新規アカウント作成</h1>

        {successMsg ? (
          <div className="auth-success" role="status">
            <span className="auth-success-icon" aria-hidden="true">✓</span>
            {successMsg}
          </div>
        ) : (
          <form onSubmit={handleSignup} noValidate className="auth-form">
            <div className="auth-field">
              <label htmlFor="signup-email" className="auth-label">メールアドレス</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                disabled={isPending}
                className="auth-input"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="signup-password" className="auth-label">
                パスワード
                <span className="auth-label-hint">（8文字以上）</span>
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={isPending}
                className="auth-input"
                minLength={8}
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="signup-pw-confirm" className="auth-label">パスワード確認</label>
              <input
                id="signup-pw-confirm"
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={isPending}
                className={[
                  'auth-input',
                  pwConfirm.length > 0
                    ? password === pwConfirm ? 'auth-input--valid' : 'auth-input--error'
                    : '',
                ].join(' ')}
                required
              />
            </div>

            <div className="auth-field auth-field--checkbox">
              <input
                id="signup-consent"
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                disabled={isPending}
                className="auth-checkbox"
                required
              />
              <label htmlFor="signup-consent" className="auth-checkbox-label">
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="auth-link">
                  利用規約
                </a>
                に同意します
              </label>
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={isPending}
              className="auth-submit-btn"
            >
              {isPending ? 'アカウント作成中…' : 'アカウント作成'}
            </button>
          </form>
        )}

        <p className="auth-switch-text">
          アカウントをお持ちの方は{' '}
          <button
            type="button"
            onClick={() => switchTo('login')}
            className="auth-link"
          >
            ログイン
          </button>
        </p>
      </div>
    </div>
  );
}
