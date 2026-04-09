/**
 * サイドバー内ナビ — 現在パスをハイライト（Client）
 */

'use client';

import Link              from 'next/link';
import { usePathname }   from 'next/navigation';

const nav = [
  { href: '/cockpit', label: 'コックピット' },
  { href: '/chat', label: 'チャット' },
  { href: '/settings', label: '設定' },
] as const;

export function AppNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="app-nav-links" aria-label="メインナビ">
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(item.href + '/'));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              fontSize:       14,
              fontWeight:     active ? 600 : 400,
              color:          active
                ? 'var(--color-neo-primary, #4F46E5)'
                : 'var(--text-main, #0F1419)',
              textDecoration: 'none',
              padding:        '8px 10px',
              borderRadius:   8,
              background:     active ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
