'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../features/auth/context';
import { communicationApi, useNotificationsRealtime } from '../../features/communication/hooks';
import { getVisibleNavigation } from '../../features/navigation/helpers';

const toBreadcrumbs = (pathname: string) => {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return ['dashboard'];
  return ['dashboard', ...segments];
};

export const AppShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const nav = getVisibleNavigation(session);
  const [unread, setUnread] = useState(0);
  const breadcrumbs = useMemo(() => toBreadcrumbs(pathname), [pathname]);

  const refreshUnread = () =>
    session && communicationApi.unreadCounter(session).then((r) => setUnread(r.count));

  useEffect(() => {
    void refreshUnread();
  }, [session]);

  useNotificationsRealtime(() => void refreshUnread());

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        background: 'var(--ui-bg)'
      }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--ui-border)',
          padding: 16,
          background: 'var(--ui-surface)'
        }}
      >
        <h2 style={{ marginTop: 0 }}>cdoprof</h2>
        <nav className="ui-stack" style={{ gap: 6 }}>
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: 'none',
                  color: isActive ? 'var(--ui-brand-700)' : 'var(--ui-text)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: isActive ? 'rgba(21,94,239,0.08)' : 'transparent',
                  fontWeight: isActive ? 600 : 500
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div style={{ display: 'grid', gridTemplateRows: '64px auto', minWidth: 0 }}>
        <header
          style={{
            borderBottom: '1px solid var(--ui-border)',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 16px',
            alignItems: 'center',
            background: 'var(--ui-surface)'
          }}
        >
          <div style={{ color: 'var(--ui-text-muted)', fontSize: 14 }}>
            {breadcrumbs.join(' / ')}
          </div>
          <div className="ui-inline">
            <Link href="/notifications" style={{ textDecoration: 'none' }}>
              Уведомления ({unread})
            </Link>
            <span>{session?.user.tenantId}</span>
            <span>{session?.user.displayName}</span>
            <button type="button" onClick={() => logout()}>
              Выйти
            </button>
          </div>
        </header>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
};
