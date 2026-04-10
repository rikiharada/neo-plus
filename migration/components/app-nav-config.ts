/**
 * サイドバー・ナビの静的定義（Server / Client で同一のリンク集合を保証）
 */

/** Post-auth landing path (`/`). Use for login redirect and revalidatePath. */
export const APP_HOME_HREF = '/' as const;

export const APP_NAV_ITEMS = [
  { href: APP_HOME_HREF, label: 'ホーム' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/accounting-desk', label: 'Ledger Desk' },
  { href: '/chat', label: 'チャット' },
  { href: '/settings', label: '設定' },
] as const;
