/**
 * サイドバー・ナビの静的定義（Server / Client で同一のリンク集合を保証）
 */

/** Post-auth landing path (`/cockpit`). Use for login redirect and revalidatePath. */
export const APP_HOME_HREF = '/cockpit' as const;

export type AppNavItem = {
  readonly href: string;
  readonly label: string;
  /** サイドバー用（未指定ならラベルのみ） */
  readonly icon?: 'folder';
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: APP_HOME_HREF, label: 'ホーム' },
  { href: '/projects', label: 'Project', icon: 'folder' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/accounting-desk', label: 'Ledger Desk' },
  { href: '/chat', label: 'チャット' },
  { href: '/settings', label: '設定' },
];
