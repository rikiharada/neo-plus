/**
 * Sidebar nav — highlights current path (client).
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAV_ITEMS } from './app-nav-config';

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
            fontSize:       14,
            fontWeight:     400,
            color:          'var(--text-main, #0F1419)',
            textDecoration: 'none',
            padding:        '8px 10px',
            borderRadius:   8,
            background:     'transparent',
          }}
        >
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
