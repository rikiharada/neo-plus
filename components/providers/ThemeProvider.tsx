/**
 * components/providers/ThemeProvider.tsx
 * ダークモード制御プロバイダー
 *
 * ハイドレーション安全設計:
 *   - サーバー側では useState(false) で初期化（SSR と一致させる）
 *   - app/layout.tsx の DARK_INIT_SCRIPT がすでに <html> に .dark クラスを付与済み
 *   - useEffect で mount 後に html.dark クラスを読んで React state を同期
 *   - useLayoutEffect は使わない（SSR で "useLayoutEffect does nothing on the server"
 *     警告が出て、Next.js 15 のハイドレーションチェックを壊すことがある）
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// ─── 型 ──────────────────────────────────────────────────────────

type ThemeContextValue = {
  dark:   boolean;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  /**
   * 初期値は false（SSR と一致）。
   * DARK_INIT_SCRIPT がすでに <html> クラスを設定しているため、
   * mount 後の useEffect で html.dark を読んで同期する。
   * → サーバー出力と最初の Client レンダリングが一致し、hydration mismatch なし
   */
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // DARK_INIT_SCRIPT が設定した実際の状態に同期
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark !== dark) setDark(isDark);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount 一回のみ

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('neo-theme', next ? 'dark' : 'light');
      } catch {
        // プライベートブラウジング等で localStorage が使えない場合は無視
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

// ─── Toggle ボタン ────────────────────────────────────────────────

export function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
    >
      {dark ? (
        // 太陽アイコン（ダーク時 → ライトに切り替え）
        <svg
          width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // 月アイコン（ライト時 → ダークに切り替え）
        <svg
          width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
