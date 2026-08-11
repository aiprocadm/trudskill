export const layoutStyles = `
.ui-app-shell-main { min-width: 0; }
.ui-dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.ui-dashboard-tile {
  display: block;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  text-decoration: none;
  color: var(--ui-text);
  background: var(--ui-surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ui-dashboard-tile:hover { border-color: var(--ui-brand-600); box-shadow: var(--ui-shadow); }
.ui-dashboard-tile-title { font-weight: 600; margin-bottom: 6px; }
.ui-dashboard-tile-note { font-size: 13px; color: var(--ui-text-muted); line-height: 1.4; }
.ui-centered-page,
.ui-auth-center,
.ui-login-center {
  min-height: 100vh;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 16px;
}
.ui-centered-page {
  padding: 20px;
  text-align: center;
}
.ui-centered-card,
.ui-auth-card { max-width: 420px; width: 100%; }
.ui-login-card { width: 100%; max-width: 100%; }
/* Брендированная страница входа */
.auth-shell { min-height: 100vh; display: grid; place-items: center; box-sizing: border-box; padding: 24px; background: radial-gradient(1100px 560px at 50% -12%, var(--ui-surface-accent), var(--ui-bg) 70%); }
.auth-shell__panel { width: 100%; max-width: 420px; display: grid; gap: 16px; }
.auth-shell__brand { display: grid; gap: 6px; justify-items: center; text-align: center; margin-bottom: 2px; }
.auth-shell__brand .ui-wordmark { font-size: 2.1rem; }
.auth-shell__tagline { margin: 0; color: var(--ui-text-muted); font-size: 0.95rem; }
.auth-divider { display: flex; align-items: center; gap: 12px; color: var(--ui-text-muted); font-size: 13px; }
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--ui-border); }
.ui-centered-stack { display: grid; gap: 10px; justify-items: center; }
.ui-system-title { margin: 0 0 8px; font-size: 2rem; font-weight: 650; }
.ui-system-text { margin: 0 0 16px; color: var(--ui-text-muted); line-height: 1.5; }
@media (max-width: 768px) {
  .ui-dashboard-grid { grid-template-columns: 1fr; }
}
/* Двухколоночная раскладка карточки (DetailLayout): main + aside. */
/* 320px — ширина трека aside, 900px — breakpoint; структурные величины, не spacing/radius. */
.ui-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 320px);
  gap: var(--ui-space-lg);
  align-items: start;
}
.ui-detail__main,
.ui-detail__aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-lg);
  min-width: 0;
}
@media (max-width: 900px) {
  .ui-detail {
    grid-template-columns: 1fr;
  }
}
`;

/*
 * Оболочка приложения (UI-020, UI-021, UI-009).
 *
 * До Фазы 1 редизайна эти 288 строк жили в `<style jsx>` внутри app-shell.tsx: сторожа
 * `token-discipline` и `touch-targets` проверяют строку uiGlobalStyles и потому каркас
 * не проверяли вовсе. Вместе с переездом убран обход `:global(...)` — он был нужен только
 * потому, что scoped-класс styled-jsx не попадал на ссылки next/link.
 *
 * UI-009: заголовки блоков меню больше не кричат — сняты uppercase и letter-spacing,
 * вес 600 вместо 700, размер из шкалы. Четыре усилителя на неглавном элементе
 * забирали внимание у того, ради чего пользователь открыл меню.
 */
export const appShellStyles = `
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--ui-sidebar-width) 1fr;
  position: relative;
}
.app-shell__menu-toggle { display: none; }
.app-shell__skip-link {
  position: absolute;
  top: -40px;
  left: var(--ui-space-md);
  z-index: 12000;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: var(--ui-space-sm) 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  text-decoration: none;
}
.app-shell__skip-link:focus { top: var(--ui-space-md); }
.app-shell__backdrop { display: none; }
.app-shell__sidebar {
  border-right: 1px solid var(--ui-border);
  padding: var(--ui-space-lg);
  background: var(--ui-nav-sidebar-bg, var(--ui-surface));
}
.app-shell__brand {
  margin: 0 0 14px;
  color: var(--ui-nav-text, var(--ui-text));
}
.app-shell__role {
  margin: 0 0 var(--ui-space-lg);
  font-size: var(--ui-font-size-sm);
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
}
.app-shell__hint {
  margin: 0 0 var(--ui-space-lg);
  padding: var(--ui-space-md);
  border-radius: var(--ui-radius-md);
  background: var(--ui-nav-active-bg);
  color: var(--ui-nav-text, var(--ui-text));
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-normal);
}
.app-shell__hint p { margin: 0 0 var(--ui-space-sm); }
.app-shell__hint-close {
  border: 1px solid var(--ui-nav-text-muted, var(--ui-border));
  background: transparent;
  color: var(--ui-nav-text, var(--ui-text));
  border-radius: var(--ui-radius-sm);
  padding: 6px 10px;
  min-height: 32px;
  cursor: pointer;
  font-weight: var(--ui-font-weight-semibold);
}
.app-shell__link {
  text-decoration: none;
  color: var(--ui-nav-text, var(--ui-text));
  padding: 10px var(--ui-space-md);
  border-radius: var(--ui-radius-sm);
  font-weight: var(--ui-font-weight-semibold);
}
.app-shell__link:hover {
  background: var(--ui-nav-hover-bg, var(--ui-surface-muted));
  color: var(--ui-nav-text, var(--ui-text));
}
.app-shell__link.is-active {
  color: var(--ui-nav-active-text, var(--ui-brand-700));
  background: var(--ui-nav-active-bg);
}
.app-shell__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.app-shell__more {
  display: flex;
  flex-direction: column;
  margin-top: var(--ui-space-sm);
  border-top: 1px solid var(--ui-nav-hover-bg, var(--ui-border));
  padding-top: var(--ui-space-sm);
}
.app-shell__more-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px var(--ui-space-md);
  border: none;
  background: transparent;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-nav-text, var(--ui-text));
  font-weight: var(--ui-font-weight-semibold);
  font-size: var(--ui-font-size-sm);
  cursor: pointer;
}
.app-shell__more-toggle:hover {
  background: var(--ui-nav-hover-bg, var(--ui-surface-muted));
}
.app-shell__more-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ui-space-sm) 0 0 var(--ui-space-md);
}
.app-shell__group-title {
  flex: 1 1 auto;
  text-align: left;
  display: flex;
  align-items: center;
  gap: var(--ui-space-sm);
  margin: 0;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
}
.app-shell__chevron {
  display: inline-flex;
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
  transition: transform 0.18s ease;
}
.app-shell__chevron.is-open { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) {
  .app-shell__chevron { transition: none; }
}
.app-shell__content {
  display: grid;
  grid-template-rows: var(--ui-topbar-height) auto;
  min-width: 0;
}
.app-shell__topbar {
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--ui-space-lg);
  gap: var(--ui-space-md);
  background: var(--ui-surface);
  flex-wrap: wrap;
}
.app-shell__breadcrumbs {
  color: var(--ui-text-muted);
  font-size: 14px;
  min-width: 0;
  flex: 1 1 200px;
}
.app-shell__crumb { white-space: nowrap; }
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
  font-weight: var(--ui-font-weight-medium);
}
.app-shell__crumb-block {
  color: var(--ui-text-muted);
  font-weight: var(--ui-font-weight-medium);
}
.app-shell__userbar {
  flex: 0 1 auto;
  justify-content: flex-end;
  gap: var(--ui-space-md);
}
.app-shell__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: var(--ui-font-size-sm);
}
.app-shell__search:hover { color: var(--ui-text); }
.app-shell__kbd {
  font-size: 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
  color: var(--ui-text-muted);
}
.app-shell__meta {
  font-size: var(--ui-font-size-sm);
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
  .app-shell { grid-template-columns: 1fr; }
  .app-shell__menu-toggle {
    display: inline-flex;
    position: fixed;
    top: var(--ui-space-md);
    left: var(--ui-space-md);
    z-index: 10001;
    align-items: center;
    height: 40px;
    padding: 0 14px;
    border-radius: var(--ui-radius-sm);
    border: 1px solid var(--ui-border);
    background: var(--ui-surface);
    color: var(--ui-text);
    font-weight: var(--ui-font-weight-semibold);
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
    background: var(--ui-overlay);
    cursor: pointer;
  }
  .app-shell__sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(var(--ui-sidebar-drawer-width), 88vw);
    z-index: 10000;
    transform: translateX(-102%);
    transition: transform 0.2s ease;
    box-shadow: var(--ui-shadow-strong);
    overflow-y: auto;
    border-right: 1px solid var(--ui-border);
  }
  .app-shell__sidebar.is-drawer-open { transform: translateX(0); }
  .app-shell__sidebar .ui-stack {
    flex-direction: column;
    flex-wrap: unset;
    overflow-x: visible;
    padding-bottom: 0;
  }
  .app-shell__content { padding-top: 56px; }
  .app-shell__link { white-space: normal; }
}
/* ФТ-H4 (Фаза 5): телефон ≤480px. Шапка с фиксированной высотой не вмещает перенос
   строк и наезжает на заголовок страницы — высота строки становится по содержимому.
   Пункты меню — тач-зоны не ниже 44px. */
@media (max-width: 480px) {
  .app-shell__content { grid-template-rows: auto 1fr; }
  .app-shell__topbar { padding: var(--ui-space-sm) var(--ui-space-md); }
  /* Крошки с nowrap вылезали за 360px и давали горизонтальную прокрутку. */
  .app-shell__crumb { white-space: normal; }
  .app-shell__menu-toggle { min-height: 44px; }
  .app-shell__more-toggle {
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .app-shell__hint-close { min-height: 44px; }
  .app-shell__sidebar .app-shell__link,
  .app-shell__topbar .app-shell__notif-link {
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .app-shell__search { height: 44px; }
}
`;

/*
 * Командная палитра (UI-021) — те же 76 строк вне надзора сторожей, что и у оболочки.
 * Затемнение и радиусы переведены на токены.
 */
export const commandPaletteStyles = `
.cmdk {
  position: fixed;
  inset: 0;
  z-index: 13000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}
.cmdk__scrim {
  position: absolute;
  inset: 0;
  border: none;
  padding: 0;
  margin: 0;
  background: var(--ui-overlay);
  cursor: pointer;
}
.cmdk__dialog {
  position: relative;
  width: min(560px, 92vw);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-strong);
  overflow: hidden;
}
.cmdk__input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px var(--ui-space-lg);
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
}
.cmdk__input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: var(--ui-text);
}
.cmdk__list {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 52vh;
  overflow-y: auto;
}
.cmdk__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-md);
  padding: 10px var(--ui-space-md);
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
  color: var(--ui-text);
}
.cmdk__option.is-active {
  background: var(--ui-nav-active-bg, var(--ui-surface-muted));
  color: var(--ui-nav-active-text, var(--ui-brand-700));
}
.cmdk__option-group {
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
  white-space: nowrap;
}
.cmdk__empty {
  padding: var(--ui-space-lg) var(--ui-space-md);
  color: var(--ui-text-muted);
  text-align: center;
}
`;
