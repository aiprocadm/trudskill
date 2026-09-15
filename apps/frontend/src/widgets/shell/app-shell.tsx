'use client';

import { ErrorBoundary, Icon, VISUALLY_HIDDEN_CLASS } from '@trudskill/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CommandPalette } from './command-palette';
import { NavHint } from './nav-hint';
import { ThemeSwitcher } from './theme-switcher';
import { useAuth } from '../../features/auth/context';
import { useTenantBranding } from '../../features/branding/context';
import { resolveWordmark } from '../../features/branding/theme';
import { useNotificationsList, useNotificationsRealtime } from '../../features/communication/hooks';
import { buildBreadcrumbs } from '../../features/navigation/breadcrumbs';
import { buildCommandItems } from '../../features/navigation/command-palette';
import { getNavigationView } from '../../features/navigation/helpers';
import { groupItemsByNavGroup } from '../../features/navigation/nav-groups';
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
   * IA-011: короткое меню роли (≤7) + всё остальное вторым уровнем. Разбиение по
   * 10 блокам ИА никуда не делось — оно применяется к содержимому «Ещё».
   */
  const navView = getNavigationView(session);
  const moreGroups = useMemo(() => groupItemsByNavGroup(navView.more), [navView.more]);
  const primaryRole = getPrimaryRoleBlueprint(session);
  const breadcrumbItems = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
  const unread = useNotificationsList(1, 1, 'unread');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  /*
   * Активная страница может лежать во втором уровне — тогда «Ещё» и её блок
   * раскрываются сами. Без этого человек на странице из «Ещё» не видит, где он
   * находится, и меню выглядит так, будто раздел исчез.
   */
  const activeMoreGroupId =
    moreGroups.find((group) => group.items.some((item) => isItemActive(item.href)))?.id ?? null;

  const [moreOpen, setMoreOpen] = useState(false);
  // Ручные раскрытия пользователя поверх авто-раскрытия активного блока.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const [paletteOpen, setPaletteOpen] = useState(false);
  /*
    Журнал 119: выход мог не подтвердиться сервером (нет сети, 500). На устройстве человек
    вышел, но сеанс на сервере жив до истечения срока — на общем компьютере учебного центра
    это чужой доступ. Молчать нельзя, поэтому предупреждение показывается прямо в шапке.
  */
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);
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

  // Блок с активной страницей всегда раскрыт (не схлопываем ручные раскрытия пользователя).
  useEffect(() => {
    if (!activeMoreGroupId) return;
    setMoreOpen(true);
    setOpenGroups((prev) =>
      prev[activeMoreGroupId] ? prev : { ...prev, [activeMoreGroupId]: true }
    );
  }, [activeMoreGroupId]);

  const isGroupOpen = (id: string) => openGroups[id] ?? id === activeMoreGroupId;
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? id === activeMoreGroupId) }));

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
        <nav className="app-shell__nav" aria-label="Основные разделы">
          {navView.main.map((item) => {
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
          {moreGroups.length ? (
            <div className="app-shell__more">
              <button
                type="button"
                className="app-shell__more-toggle"
                aria-expanded={moreOpen}
                aria-controls="app-shell-more"
                onClick={() => setMoreOpen((open) => !open)}
              >
                <span className="app-shell__more-title">Ещё</span>
                <span className={`app-shell__chevron ${moreOpen ? 'is-open' : ''}`}>
                  <Icon icon={ChevronDownIcon} size={16} />
                </span>
              </button>
              <div id="app-shell-more" className="app-shell__more-panel" hidden={!moreOpen}>
                {moreGroups.map((group) => {
                  const open = isGroupOpen(group.id);
                  const regionId = `nav-group-${group.id}`;
                  return (
                    <div className="app-shell__group" key={group.id}>
                      <button
                        type="button"
                        className="app-shell__group-header"
                        aria-expanded={open}
                        aria-controls={regionId}
                        onClick={() => toggleGroup(group.id)}
                      >
                        <Icon icon={group.icon} size={20} />
                        <span className="app-shell__group-title">{group.label}</span>
                        <span className={`app-shell__chevron ${open ? 'is-open' : ''}`}>
                          <Icon icon={ChevronDownIcon} size={16} />
                        </span>
                      </button>
                      <div id={regionId} className="app-shell__group-items ui-stack" hidden={!open}>
                        {group.items.map((item) => {
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </nav>
        <NavHint />
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
            {/*
              Идентификатор арендатора отсюда убран: он был сырым машинным значением
              («3f7a-…») с подписью «Тенант» — слово, которого администратор учебного центра
              не знает. И это был ДУБЛЬ: название центра уже стоит слева в шапке, где ему и
              место (`resolveWordmark`). Правило продукта: ни одного идентификатора как
              значения.
            */}
            <ThemeSwitcher />
            <span className="app-shell__meta">{session?.user.displayName}</span>
            <button
              type="button"
              className="ui-button"
              onClick={() => {
                setLogoutWarning(null);
                void logout().catch((error: unknown) => {
                  setLogoutWarning(
                    error instanceof Error
                      ? error.message
                      : 'Выход выполнен на этом устройстве, но сервер не подтвердил завершение сеанса.'
                  );
                });
              }}
            >
              Выйти
            </button>
          </div>
        </header>
        {logoutWarning ? (
          <p className="ui-callout ui-callout--warning" role="alert">
            {logoutWarning}
          </p>
        ) : null}
        <div className="ui-app-shell-main">
          {/*
            ТЗ 1.1.4: падение одного блока не должно уносить страницу. Перехватчик стоит
            ВНУТРИ оболочки — меню, крошки и выход остаются рабочими, человек не выпадает
            из системы. Держит сторож `error-boundary-wraps-content.e2e.test.ts`.
          */}
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
      <CommandPalette open={paletteOpen} items={commandItems} onClose={closePalette} />
    </div>
  );
};
