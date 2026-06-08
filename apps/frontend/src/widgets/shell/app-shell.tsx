'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../features/auth/context';
import { useNotificationsList, useNotificationsRealtime } from '../../features/communication/hooks';
import { buildBreadcrumbs } from '../../features/navigation/breadcrumbs';
import { getNavigationView } from '../../features/navigation/helpers';
import { getPrimaryRoleBlueprint } from '../../features/navigation/role-blueprints';

const formatUnreadBadge = (total: number | undefined) => {
  const n = total ?? 0;
  if (n <= 0) return null;
  if (n > 9) return '9+';
  return String(n);
};

export const AppShell = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const navView = getNavigationView(session);
  const primaryRole = getPrimaryRoleBlueprint(session);
  const breadcrumbItems = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
  const unread = useNotificationsList(1, 1, 'unread');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useNotificationsRealtime(() => void unread.refetch());

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const unreadLabel = formatUnreadBadge(unread.data?.total);

  return (
    <div className="app-shell">
      <a href="#app-shell-main" className="app-shell__skip-link">
        Перейти к основному содержимому
      </a>
      <button
        type="button"
        className="app-shell__menu-toggle"
        aria-expanded={mobileNavOpen}
        aria-controls="app-shell-nav"
        onClick={() => setMobileNavOpen((open) => !open)}
      >
        {mobileNavOpen ? 'Закрыть меню' : 'Меню'}
      </button>
      {mobileNavOpen ? (
        <button
          type="button"
          className="app-shell__backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside
        id="app-shell-nav"
        className={`app-shell__sidebar ${mobileNavOpen ? 'is-drawer-open' : ''}`}
      >
        <h2 className="app-shell__brand">
          <span className="ui-wordmark">
            CDO<span className="ui-wordmark__accent">проф</span>
          </span>
        </h2>
        {primaryRole ? <p className="app-shell__role">Роль: {primaryRole.displayName}</p> : null}
        <nav className="ui-stack" aria-label="Основные разделы">
          {navView.main.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell__link ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          {navView.more.length ? (
            <details className="app-shell__more">
              <summary aria-label="Показать дополнительные разделы">Еще разделы</summary>
              <div className="ui-stack" style={{ gap: 6 }}>
                {navView.more.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`app-shell__link app-shell__link--more ${isActive ? 'is-active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </details>
          ) : null}
        </nav>
      </aside>
      <div className="app-shell__content" id="app-shell-main" tabIndex={-1}>
        <header className="app-shell__topbar">
          <nav className="app-shell__breadcrumbs" aria-label="Хлебные крошки">
            {breadcrumbItems.map((crumb, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <span key={crumb.href} className="app-shell__crumb">
                  {index > 0 ? <span className="app-shell__crumb-sep"> / </span> : null}
                  {isLast ? (
                    <span className="app-shell__crumb-current">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="app-shell__crumb-link">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="app-shell__userbar ui-inline">
            <Link href="/notifications" className="app-shell__notif-link">
              Уведомления
              {unreadLabel ? (
                <span
                  className="ui-badge ui-badge--brand"
                  aria-label={`Непрочитано: ${unread.data?.total ?? 0}`}
                >
                  {unreadLabel}
                </span>
              ) : null}
            </Link>
            <span className="app-shell__meta" title="Тенант">
              {session?.user.tenantId}
            </span>
            <span className="app-shell__meta">{session?.user.displayName}</span>
            <button type="button" className="ui-button" onClick={() => logout()}>
              Выйти
            </button>
          </div>
        </header>
        <div className="ui-app-shell-main">{children}</div>
      </div>
      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 260px 1fr;
          position: relative;
        }
        .app-shell__menu-toggle {
          display: none;
        }
        .app-shell__skip-link {
          position: absolute;
          top: -40px;
          left: 12px;
          z-index: 12000;
          background: var(--ui-surface);
          color: var(--ui-text);
          padding: 8px 10px;
          border: 1px solid var(--ui-border);
          border-radius: 8px;
          text-decoration: none;
        }
        .app-shell__skip-link:focus {
          top: 12px;
        }
        .app-shell__backdrop {
          display: none;
        }
        .app-shell__sidebar {
          border-right: 1px solid var(--ui-border);
          padding: 16px;
          background: var(--ui-nav-sidebar-bg, var(--ui-surface));
        }
        .app-shell__brand {
          margin: 0 0 14px;
          color: var(--ui-nav-text, var(--ui-text));
        }
        .app-shell__role {
          margin: 0 0 16px;
          font-size: 13px;
          color: var(--ui-nav-text-muted, var(--ui-text-muted));
        }
        .app-shell__link {
          text-decoration: none;
          color: var(--ui-nav-text, var(--ui-text));
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 600;
        }
        .app-shell__link:hover {
          background: var(--ui-nav-hover-bg, var(--ui-surface-muted));
          color: var(--ui-nav-text, var(--ui-text));
        }
        .app-shell__link.is-active {
          color: var(--ui-nav-active-text, var(--ui-brand-700));
          background: var(--ui-nav-active-bg);
        }
        .app-shell__link--more {
          font-weight: 400;
          padding: 8px 10px;
        }
        .app-shell__more {
          border-top: 1px solid var(--ui-border);
          margin-top: 8px;
          padding-top: 10px;
        }
        .app-shell__more > summary {
          cursor: pointer;
          color: var(--ui-nav-text-muted, var(--ui-text-muted));
          font-size: 14px;
          margin-bottom: 8px;
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
          gap: 12px;
          background: var(--ui-surface);
          flex-wrap: wrap;
        }
        .app-shell__breadcrumbs {
          color: var(--ui-text-muted);
          font-size: 14px;
          min-width: 0;
          flex: 1 1 200px;
        }
        .app-shell__crumb {
          white-space: nowrap;
        }
        .app-shell__crumb-link {
          color: var(--ui-text-muted);
          text-decoration: none;
        }
        .app-shell__crumb-link:hover {
          color: var(--ui-brand-700);
          text-decoration: underline;
        }
        .app-shell__crumb-current {
          color: var(--ui-text);
          font-weight: 500;
        }
        .app-shell__userbar {
          flex: 0 1 auto;
          justify-content: flex-end;
        }
        .app-shell__meta {
          font-size: 13px;
          color: var(--ui-text-muted);
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .app-shell__notif-link {
          text-decoration: none;
          color: inherit;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        @media (max-width: 1024px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          .app-shell__menu-toggle {
            display: inline-flex;
            position: fixed;
            top: 12px;
            left: 12px;
            z-index: 10001;
            align-items: center;
            height: 40px;
            padding: 0 14px;
            border-radius: 10px;
            border: 1px solid var(--ui-border);
            background: var(--ui-surface);
            color: var(--ui-text);
            font-weight: 600;
            cursor: pointer;
            box-shadow: var(--ui-shadow);
          }
          .app-shell__backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 9998;
            border: none;
            padding: 0;
            margin: 0;
            background: rgba(15, 23, 42, 0.45);
            cursor: pointer;
          }
          .app-shell__sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: min(300px, 88vw);
            z-index: 10000;
            transform: translateX(-102%);
            transition: transform 0.2s ease;
            box-shadow: var(--ui-shadow-strong);
            overflow-y: auto;
            border-right: 1px solid var(--ui-border);
          }
          .app-shell__sidebar.is-drawer-open {
            transform: translateX(0);
          }
          .app-shell__sidebar .ui-stack {
            flex-direction: column;
            flex-wrap: unset;
            overflow-x: visible;
            padding-bottom: 0;
          }
          .app-shell__content {
            padding-top: 56px;
          }
          .app-shell__link {
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
};
