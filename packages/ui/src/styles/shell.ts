/*
 * CSS каркаса приложения (UI-020).
 *
 * До Фазы 1 эти 288 строк жили в <style jsx> внутри app-shell.tsx и были НЕ ВИДНЫ
 * сторожам пакета: token-discipline и touch-targets читают строку uiGlobalStyles.
 * Внутри накопился хардкод (rgba подложки, радиусы 10px) и обход :global(...) с
 * авторской пометкой «давний дефект каркаса». Обход исчез сам: scoped-классов
 * styled-jsx, мимо которых промахивались правила, здесь больше нет.
 *
 * Отдельный слой, а не дописка в layout.ts (решение владельца №3 по существу —
 * «в пакет, под сторожа»): layout.ts занят сетками дашборда и центрированием
 * страниц входа, и совмещение дало бы файл на 355 строк с двумя назначениями.
 */
export const shellStyles = `
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 260px 1fr; position: relative; }
.app-shell__menu-toggle { display: none; }
.app-shell__skip-link {
  position: absolute;
  top: -40px;
  left: 12px;
  z-index: 12000;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  text-decoration: none;
}
.app-shell__skip-link:focus { top: 12px; }
.app-shell__backdrop { display: none; }
.app-shell__sidebar {
  border-right: 1px solid var(--ui-border);
  padding: 16px;
  background: var(--ui-nav-sidebar-bg, var(--ui-surface));
}
.app-shell__brand { margin: 0 0 14px; color: var(--ui-nav-text, var(--ui-text)); }
.app-shell__role {
  margin: 0 0 16px;
  font-size: var(--ui-font-size-sm);
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
}
.app-shell__link {
  text-decoration: none;
  color: var(--ui-nav-text, var(--ui-text));
  padding: 10px 12px;
  border-radius: var(--ui-radius-md);
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
.app-shell__nav { display: flex; flex-direction: column; gap: 2px; }
.app-shell__more { margin-top: 8px; border-top: 1px solid var(--ui-border); padding-top: 8px; }
.app-shell__more-toggle,
.app-shell__group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--ui-radius-md);
  color: var(--ui-nav-text, var(--ui-text));
  cursor: pointer;
}
/* UI-009: на заголовке блока стояли четыре усилителя разом — uppercase,
   letter-spacing, вес 700 и уменьшенный размер. Это неглавный элемент, он
   отделяется расстоянием, а не криком. */
.app-shell__more-toggle { font-weight: 600; font-size: var(--ui-font-size-md); }
.app-shell__group-header { font-weight: 600; font-size: var(--ui-font-size-sm); }
.app-shell__more-toggle:hover,
.app-shell__group-header:hover { background: var(--ui-nav-hover-bg, var(--ui-surface-muted)); }
.app-shell__more-title,
.app-shell__group-title { flex: 1 1 auto; text-align: left; }
.app-shell__more-panel[hidden] { display: none; }
.app-shell__chevron {
  display: inline-flex;
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
  transition: transform 0.18s ease;
}
.app-shell__chevron.is-open { transform: rotate(180deg); }
.app-shell__group { display: flex; flex-direction: column; }
.app-shell__group-items { gap: 2px; padding: 2px 0 6px 12px; }
.app-shell__group-items[hidden] { display: none; }
.app-shell__hint {
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-accent);
  color: var(--ui-text);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-shell__hint-text { margin: 0; font-size: var(--ui-font-size-sm); line-height: 1.4; }
@media (prefers-reduced-motion: reduce) {
  .app-shell__chevron { transition: none; }
}
.app-shell__content { display: grid; grid-template-rows: 64px auto; min-width: 0; }
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
.app-shell__crumb { white-space: nowrap; }
.app-shell__crumb-link { color: var(--ui-text-muted); text-decoration: none; }
.app-shell__crumb-link:hover { color: var(--ui-brand-700); text-decoration: underline; }
.app-shell__crumb-current { color: var(--ui-text); font-weight: 500; }
.app-shell__crumb-block { color: var(--ui-text-muted); font-weight: 500; }
.app-shell__userbar { flex: 0 1 auto; justify-content: flex-end; gap: 12px; }
.app-shell__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
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
    top: 12px;
    left: 12px;
    z-index: 10001;
    align-items: center;
    height: 40px;
    padding: 0 14px;
    border-radius: var(--ui-radius-md);
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
    background: var(--ui-overlay);
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
/* ФТ-H4: телефон ≤480px. Правила для ссылок раньше приходилось писать через
   :global(...) — их рендерит next/link, и scoped-класс styled-jsx на них не
   попадал. Слой глобальный, обход больше не нужен. */
@media (max-width: 480px) {
  .app-shell__content { grid-template-rows: auto 1fr; }
  .app-shell__topbar { padding: 8px 12px; }
  .app-shell__crumb { white-space: normal; }
  .app-shell__menu-toggle { height: 44px; }
  .app-shell__more-toggle,
  .app-shell__group-header { min-height: 44px; display: flex; align-items: center; }
  .app-shell__link,
  .app-shell__notif-link { min-height: 44px; display: flex; align-items: center; }
  .app-shell__search { height: 44px; }
}
`;
