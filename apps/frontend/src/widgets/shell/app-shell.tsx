'use client';

import Link from 'next/link';
import { type PropsWithChildren, useEffect, useState } from 'react';

import { useAuth } from '../../features/auth/context';
import { communicationApi, useNotificationsRealtime } from '../../features/communication/hooks';
import { getVisibleNavigation } from '../../features/navigation/helpers';

export const AppShell = ({ children }: PropsWithChildren) => {
  const { session, logout } = useAuth();
  const nav = getVisibleNavigation(session);
  const [unread, setUnread] = useState(0);
  const refreshUnread = () => session && communicationApi.unreadCounter(session).then((r) => setUnread(r.count));

  useEffect(() => {
    void refreshUnread();
  }, [session]);

  useNotificationsRealtime(() => void refreshUnread());

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
            <Link href="/notifications">Notifications ({unread})</Link>
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
