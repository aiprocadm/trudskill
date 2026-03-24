'use client';

import Link from 'next/link';
import type { PropsWithChildren } from 'react';
import { getVisibleNavigation } from '../../features/navigation/helpers';
import { useAuth } from '../../features/auth/context';

export const AppShell = ({ children }: PropsWithChildren) => {
  const { session, logout } = useAuth();
  const nav = getVisibleNavigation(session);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '240px 1fr' }}>
      <aside style={{ borderRight: '1px solid #e4e4e7', padding: 16 }}>
        <h2>cdoprof</h2>
        <nav style={{ display: 'grid', gap: 6 }}>
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div style={{ display: 'grid', gridTemplateRows: '64px auto' }}>
        <header style={{ borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', padding: '0 16px', alignItems: 'center' }}>
          <div>Breadcrumbs placeholder</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Notifications placeholder</span>
            <span>{session?.user.displayName}</span>
            <button type="button" onClick={() => logout()}>
              Выйти
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
};
