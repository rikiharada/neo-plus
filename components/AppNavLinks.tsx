/**
 * Sidebar nav — highlights current path (client).
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAV_ITEMS } from './app-nav-config';

function FolderNavIcon({ active }: { active: boolean }) {
  const c = active
    ? 'var(--color-neo-primary, #4F46E5)'
    : 'var(--text-muted, #536471)';
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 7.5C4 6.12 5.12 5 6.5 5h3.88c.53 0 1.04.21 1.41.59l1.12 1.12c.2.2.47.31.75.31H17.5c1.38 0 2.5 1.12 2.5 2.5v7.5c0 1.38-1.12 2.5-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke={c}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function navItemActive(pathname: string, href: string): boolean {
  const p = pathname || '/';
  return p === href || (href !== '/' && p.startsWith(`${href}/`));
}

/** Same links as live nav; neutral styles for Suspense fallback */
export function AppNavLinksFallback() {
  return (
    <nav className="app-nav-links" aria-label="Main navigation" aria-busy="true">
      {APP_NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            8,
            fontSize:       14,
            fontWeight:     400,
            color:          'var(--text-main, #0F1419)',
            textDecoration: 'none',
            padding:        '8px 10px',
            borderRadius:   8,
            background:     'transparent',
          }}
        >
          {item.icon === 'folder' ? <FolderNavIcon active={false} /> : null}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppNavLinks() {
  const pathname = usePathname() ?? '';

  return (
    <nav className="app-nav-links" aria-label="Main navigation">
      {APP_NAV_ITEMS.map((item) => {
        const active = navItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            8,
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
            {item.icon === 'folder' ? <FolderNavIcon active={active} /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
