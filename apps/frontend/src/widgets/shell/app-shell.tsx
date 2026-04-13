'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useMemo } from 'react';

import { useAuth } from '../../features/auth/context';
import { useNotificationsList, useNotificationsRealtime } from '../../features/communication/hooks';
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
  const breadcrumbs = useMemo(() => toBreadcrumbs(pathname), [pathname]);
  const unread = useNotificationsList(1, 1, 'unread');

  useNotificationsRealtime(() => void unread.refetch());

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <h2 className="app-shell__brand">cdoprof</h2>
        <nav className="ui-stack">
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell__link ${isActive ? 'is-active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div className="app-shell__breadcrumbs">{breadcrumbs.join(' / ')}</div>
          <div className="ui-inline">
            <Link href="/notifications" className="app-shell__notif-link">
              Уведомления{' '}
              <span className="ui-badge" style={{ background: 'var(--ui-brand-600)' }}>
                {unread.data?.total ?? 0}
              </span>
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
      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 260px 1fr;
        }
        .app-shell__sidebar {
          border-right: 1px solid var(--ui-border);
          padding: 16px;
          background: var(--ui-surface);
        }
        .app-shell__brand {
          margin: 0 0 14px;
        }
        .app-shell__link {
          text-decoration: none;
          color: var(--ui-text);
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 500;
        }
        .app-shell__link:hover {
          background: var(--ui-surface-muted);
        }
        .app-shell__link.is-active {
          color: var(--ui-brand-700);
          background: rgba(37, 99, 235, 0.1);
        }
        .app-shell__content {
          display: grid;
          grid-template-rows: 64px auto;
          min-width: 0;
        }
        .app-shell__topbar {
          border-bottom: 1px solid var(--ui-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 16px;
          background: var(--ui-surface);
        }
        .app-shell__breadcrumbs {
          color: var(--ui-text-muted);
          font-size: 14px;
        }
        .app-shell__notif-link {
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        @media (max-width: 1024px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          .app-shell__sidebar {
            border-right: 0;
            border-bottom: 1px solid var(--ui-border);
          }
          .app-shell__sidebar .ui-stack {
            display: flex;
            flex-direction: row;
            flex-wrap: nowrap;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 6px;
            -webkit-overflow-scrolling: touch;
          }
          .app-shell__link {
            white-space: nowrap;
            flex: 0 0 auto;
          }
        }
      `}</style>
    </div>
  );
};
