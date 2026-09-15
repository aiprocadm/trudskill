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
import { activeNavHref, getNavigationView } from '../../features/navigation/helpers';
import {
  collapseSingleItemGroups,
  groupItemsByNavGroup
} from '../../features/navigation/nav-groups';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon
} from '../../features/navigation/nav-icons';
import {
  type OpenGroups,
  readOpenGroups,
  isGroupOpen as resolveGroupOpen,
  toggleGroup as toggleGroupState,
  writeOpenGroups
} from '../../features/navigation/open-groups-state';
import { getPrimaryRoleBlueprint } from '../../features/navigation/role-blueprints';
import {
  iconForHref,
  readSidebarCollapsed,
  writeSidebarCollapsed
} from '../../features/navigation/sidebar-state';

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
   * IA-011: сверху — короткое меню роли (≤7 частых разделов), ниже — остальные разделы,
   * разложенные по 10 блокам ИА. Второго этажа («Ещё») больше нет: ТЗ 3.1.
   */
  const navView = getNavigationView(session);
  /*
   * ТЗ 3.2 (Н4): группа из одного пункта схлопывается — пункт поднимается на верхний уровень.
   * Заголовок над единственной строкой это лишний клик и обещание, что внутри есть что-то ещё.
   */
  const { loose: looseItems, groups: moreGroups } = useMemo(
    () => collapseSingleItemGroups(groupItemsByNavGroup(navView.more)),
    [navView.more]
  );
  const primaryRole = getPrimaryRoleBlueprint(session);
  const breadcrumbItems = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
  const unread = useNotificationsList(1, 1, 'unread');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  /*
   * ТЗ 2.2, пункт 3: подсвечен ровно ОДИН пункт. Признак «адрес начинается со ссылки» зажигал
   * два сразу на любом вложенном адресе («Мой кабинет» + «Мои курсы»), а таких пар в меню
   * девять. Теперь активен самый точный пункт — выбор делает `activeNavHref`, и его держит
   * сторож `menu-leads-somewhere.e2e.test.ts`.
   */
  const allHrefs = useMemo(
    () => [...navView.main, ...navView.more].map((item) => item.href),
    [navView.main, navView.more]
  );
  const activeHref = activeNavHref(pathname, allHrefs);
  const isItemActive = (href: string) => href === activeHref;

  /*
   * Активная страница может лежать в группе — тогда группа раскрывается сама. Без этого
   * человек на такой странице не видит, где он находится, и меню выглядит так, будто раздел
   * исчез.
   */
  const activeMoreGroupId =
    moreGroups.find((group) => group.items.some((item) => isItemActive(item.href)))?.id ?? null;

  /*
   * ТЗ 3.1: раскрытие групп переживает переход на другую страницу.
   *
   * Читаем ПОСЛЕ монтирования, а не при первом рендере: на сервере хранилища браузера нет, и
   * разметка разошлась бы с гидрацией — та же грабля, что у подсказки меню.
   */
  const [openGroups, setOpenGroups] = useState<OpenGroups>({});
  /* ТЗ 3.3: свёрнутая колонка тоже запоминается — человек настроил ширину один раз. */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setOpenGroups(readOpenGroups(window.localStorage));
    setCollapsed(readSidebarCollapsed(window.localStorage));
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarCollapsed(window.localStorage, next);
  };

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

  /*
   * Авто-раскрытие группы с текущей страницей теперь считается правилом (`resolveGroupOpen`),
   * а не отдельным эффектом. Прежний эффект НАВЯЗЫВАЛ раскрытие: человек, свернувший группу,
   * в которой находится, тут же получал её обратно раскрытой. Решение человека о его же меню
   * важнее автоматики — и записывать авто-раскрытие в хранилище тоже незачем: оно вычисляется.
   */

  const isGroupOpen = (id: string) =>
    resolveGroupOpen({ groupId: id, saved: openGroups, activeGroupId: activeMoreGroupId });
  const toggleGroup = (id: string) => {
    const next = toggleGroupState({
      groupId: id,
      saved: openGroups,
      activeGroupId: activeMoreGroupId
    });
    setOpenGroups(next);
    writeOpenGroups(window.localStorage, next);
  };

  const unreadLabel = formatUnreadBadge(unread.data?.total);

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--narrow' : ''}`}>
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
        {/*
          ТЗ 3.3: «Свернуть меню» — остаются значки. Подпись называет РЕЗУЛЬТАТ нажатия
          (правило продукта №5), а не текущее состояние: «Свернуть меню» сворачивает.
        */}
        <button
          type="button"
          className="app-shell__sidebar-toggle"
          aria-expanded={!collapsed}
          aria-controls="app-shell-nav"
          onClick={toggleCollapsed}
        >
          <Icon icon={collapsed ? ChevronRightIcon : ChevronLeftIcon} size={16} />
          <span className="app-shell__link-label">
            {collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          </span>
        </button>
        <nav className="app-shell__nav" aria-label="Основные разделы">
          {navView.main.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell__link ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
              >
                <span className="app-shell__link-icon">
                  <Icon icon={iconForHref(item.href)} size={16} label={item.label} />
                </span>
                <span className="app-shell__link-label">{item.label}</span>
              </Link>
            );
          })}
          {/* ТЗ 3.2: пункты схлопнутых групп — обычными ссылками, рядом с коротким меню роли. */}
          {looseItems.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell__link ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
              >
                <span className="app-shell__link-icon">
                  <Icon icon={iconForHref(item.href)} size={16} label={item.label} />
                </span>
                <span className="app-shell__link-label">{item.label}</span>
              </Link>
            );
          })}
          {/*
            ТЗ 3.1 (Н1): «Ещё» больше нет. Группы стоят прямо в меню — свёрнутые, но ВИДНЫЕ.
            Прежде человек видел семь строк и делал единственный возможный вывод: в системе семь
            разделов, — а девять групп и полсотни пунктов прятались за одной кнопкой, раскрытие
            которой к тому же не переживало перехода на другую страницу.
          */}
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
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="app-shell__link-icon">
                          <Icon icon={iconForHref(item.href)} size={16} label={item.label} />
                        </span>
                        <span className="app-shell__link-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
