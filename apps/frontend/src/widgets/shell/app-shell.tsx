'use client';

import { Icon, VISUALLY_HIDDEN_CLASS } from '@trudskill/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommandPalette } from './command-palette';
import { dismissNavHint, shouldShowNavHint } from './nav-hint';
import { useAuth } from '../../features/auth/context';
import { useTenantBranding } from '../../features/branding/context';
import { resolveWordmark } from '../../features/branding/theme';
import { useNotificationsList, useNotificationsRealtime } from '../../features/communication/hooks';
import { buildBreadcrumbs } from '../../features/navigation/breadcrumbs';
import { buildCommandItems } from '../../features/navigation/command-palette';
import { getNavigationView } from '../../features/navigation/helpers';
import { buildMoreSections } from '../../features/navigation/nav-groups';
import { ChevronDownIcon, SearchIcon } from '../../features/navigation/nav-icons';
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
  // ФТ-D3.1: название и логотип центра в шапке; без бренда — wordmark платформы.
  const branding = useTenantBranding();
  /*
   * IA-011: меню собирается из двух слоёв — короткий главный список роли (≤7) и
   * второй уровень «Ещё» с тем же разбиением на 10 блоков ИА. Раньше здесь стоял
   * getGroupedNavigation, и пользователь получал сразу все 70 пунктов; сама
   * getNavigationView была написана и покрыта тестом, но никем не вызывалась.
   */
  const { main: mainItems, more: moreItems } = useMemo(() => getNavigationView(session), [session]);
  const moreSections = useMemo(() => buildMoreSections(moreItems), [moreItems]);
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryRole = getPrimaryRoleBlueprint(session);
  const breadcrumbItems = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
  const unread = useNotificationsList(1, 1, 'unread');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Если активная страница уехала во второй уровень, «Ещё» открыто — иначе пользователь
  // не видит, где он находится.
  const activeInMore = moreItems.some((item) => isItemActive(item.href));

  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteReturnRef = useRef<HTMLElement | null>(null);
  const commandItems = useMemo(() => buildCommandItems(session), [session]);

  const openPalette = useCallback(() => {
    paletteReturnRef.current = (document.activeElement as HTMLElement) ?? null;
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    // Фокус возвращается на место вызова.
    paletteReturnRef.current?.focus();
  }, []);

  // Глобальный Ctrl/⌘+K: открыть/закрыть палитру, сохраняя корректный возврат фокуса.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        if (paletteOpen) {
          closePalette();
        } else {
          openPalette();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, openPalette, closePalette]);

  /*
   * Счётчик непрочитанных обновляет сам хук — он сбрасывает ключ `['notifications']`,
   * на котором висит `useNotificationsList` выше. Свой колбэк здесь давал второй
   * запрос на каждое событие и новую стрелку на каждый рендер (Фаза 6, дефект A).
   */
  useNotificationsRealtime();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Переход на страницу из второго уровня раскрывает «Ещё»: пункт меню должен быть виден
  // там, где пользователь сейчас стоит.
  useEffect(() => {
    if (activeInMore) setMoreOpen(true);
  }, [activeInMore]);

  // IA-020: подсказка читается только на клиенте — на сервере localStorage нет.
  const [hintVisible, setHintVisible] = useState(false);
  useEffect(() => {
    setHintVisible(shouldShowNavHint((key) => localStorage.getItem(key)));
  }, []);

  const closeHint = useCallback(() => {
    dismissNavHint((key, value) => localStorage.setItem(key, value));
    setHintVisible(false);
  }, []);

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
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- внешний URL центра, домены заранее неизвестны
            <img
              src={branding.logoUrl}
              alt=""
              style={{ maxHeight: 28, maxWidth: 120, objectFit: 'contain' }}
            />
          ) : null}
          <span className="ui-wordmark">{resolveWordmark(branding)}</span>
        </h2>
        {primaryRole ? <p className="app-shell__role">Роль: {primaryRole.displayName}</p> : null}
        {hintVisible ? (
          <div className="app-shell__hint" role="status" data-testid="nav-hint">
            <p>Меню стало короче. Всё остальное — в разделе «Ещё» и по Ctrl+K.</p>
            <button type="button" className="app-shell__hint-close" onClick={closeHint}>
              Понятно
            </button>
          </div>
        ) : null}
        <nav className="app-shell__nav" aria-label="Основные разделы">
          {mainItems.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell__link ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}

          {moreSections.length > 0 ? (
            <div className="app-shell__more">
              <button
                type="button"
                className="app-shell__more-toggle"
                aria-expanded={moreOpen}
                aria-controls="app-shell-more"
                onClick={() => setMoreOpen((open) => !open)}
              >
                <span className="app-shell__group-title">Ещё</span>
                <span className={`app-shell__chevron ${moreOpen ? 'is-open' : ''}`}>
                  <Icon icon={ChevronDownIcon} size={16} />
                </span>
              </button>
              <div id="app-shell-more" className="ui-stack" hidden={!moreOpen}>
                {moreSections.map((section) => (
                  <section className="app-shell__more-section" key={section.id}>
                    <p className="app-shell__group-title">
                      <Icon icon={section.icon} size={20} />
                      {section.label}
                    </p>
                    {section.items.map((item) => {
                      const active = isItemActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`app-shell__link ${active ? 'is-active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>
          ) : null}
        </nav>
      </aside>
      <div className="app-shell__content" id="app-shell-main" tabIndex={-1}>
        <header className="app-shell__topbar">
          <nav className="app-shell__breadcrumbs" aria-label="Хлебные крошки">
            {breadcrumbItems.map((crumb, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <span key={`${index}-${crumb.label}`} className="app-shell__crumb">
                  {index > 0 ? <span className="app-shell__crumb-sep"> / </span> : null}
                  {isLast || !crumb.href ? (
                    <span
                      className={isLast ? 'app-shell__crumb-current' : 'app-shell__crumb-block'}
                    >
                      {crumb.label}
                    </span>
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
            <button
              type="button"
              className="app-shell__search"
              onClick={openPalette}
              aria-keyshortcuts="Control+K Meta+K"
            >
              <Icon icon={SearchIcon} size={16} />
              <span>Поиск</span>
              <kbd className="app-shell__kbd">Ctrl K</kbd>
            </button>
            <Link href="/notifications" className="app-shell__notif-link">
              Уведомления
              {/* Постоянная live-region: смена счётчика непрочитанных озвучивается скринридером. */}
              <span
                role="status"
                aria-live="polite"
                aria-label={`Непрочитано: ${unread.data?.total ?? 0}`}
                className={unreadLabel ? 'ui-badge ui-badge--brand' : VISUALLY_HIDDEN_CLASS}
              >
                {unreadLabel ?? ''}
              </span>
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
      <CommandPalette open={paletteOpen} items={commandItems} onClose={closePalette} />
    </div>
  );
};
