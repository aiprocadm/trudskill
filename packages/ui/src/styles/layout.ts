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
  transition: border-color var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease);
}
.ui-dashboard-tile:hover { border-color: var(--ui-brand-600); }
.ui-dashboard-tile-title { font-weight: var(--ui-font-weight-semibold); margin-bottom: 6px; }
.ui-dashboard-tile-note { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); line-height: var(--ui-line-height-normal); }
.ui-centered-page,
.ui-auth-center,
.ui-login-center {
  min-height: 100dvh;
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
.auth-shell { min-height: 100dvh; display: grid; place-items: center; box-sizing: border-box; padding: 24px; background: radial-gradient(1100px 560px at 50% -12%, var(--ui-surface-accent), var(--ui-bg) 70%); }
.auth-shell__panel { width: 100%; max-width: 420px; display: grid; gap: 16px; }
.auth-shell__brand { display: grid; gap: 6px; justify-items: center; text-align: center; margin-bottom: 2px; }
.auth-shell__brand .ui-wordmark { font-size: var(--ui-font-size-3xl); }
.auth-shell__tagline { margin: 0; color: var(--ui-text-muted); font-size: var(--ui-font-size-md); }
.auth-divider { display: flex; align-items: center; gap: 12px; color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--ui-border); }
.ui-centered-stack { display: grid; gap: 10px; justify-items: center; }
.ui-system-title { margin: 0 0 8px; font-size: var(--ui-font-size-3xl); font-weight: var(--ui-font-weight-bold); }
.ui-system-text { margin: 0 0 16px; color: var(--ui-text-muted); line-height: var(--ui-line-height-normal); }
@media (max-width: 768px) {
  .ui-dashboard-grid { grid-template-columns: 1fr; }
}
/* Двухколоночная раскладка карточки (DetailLayout): main + aside. */
/* 320px — ширина трека aside, 900px — breakpoint; структурные величины, не spacing/radius. */
.ui-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 320px);
  /* UI-016, контекст «карточка»: между блоками — xl (24). */
  gap: var(--ui-space-xl);
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
/*
 * TPL-002 / ТЗ 5.7 (Э7): вкладки страницы — ОДИН уровень.
 *
 * Полоса прокручивается вбок, а не переносится по строкам: на телефоне четыре вкладки в две
 * строки съедают половину первого экрана. Тач-зона 44px (решение владельца №C).
 */
.ui-tabs {
  display: flex;
  gap: var(--ui-space-xs);
  overflow-x: auto;
  border-bottom: 1px solid var(--ui-border);
}
.ui-tab {
  min-height: 44px;
  padding: var(--ui-space-sm) var(--ui-space-md);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--ui-text-muted);
  font-weight: var(--ui-font-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}
.ui-tab:hover {
  color: var(--ui-text);
  background: none;
}
/* Открытая вкладка помечена И цветом, И подчёркиванием: цвет один смысл не несёт (WCAG 1.4.1). */
.ui-tab--active {
  color: var(--ui-text);
  border-bottom-color: var(--ui-brand-600);
}

/* IA-018: оглавление настроек — плитки разделов вместо 14 пунктов меню. */
.ui-settings-toc {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--ui-space-sm);
}
.ui-settings-toc__link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 44px;
  justify-content: center;
  padding: var(--ui-space-sm) var(--ui-space-md);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  text-decoration: none;
}
.ui-settings-toc__link:hover {
  border-color: var(--ui-brand-600);
}
.ui-settings-toc__title { font-weight: var(--ui-font-weight-semibold); }
/* ТЗ 5.7 (Э7): заголовок группы разделов — «Настроить здесь» против «Открыть отдельный». */
.ui-settings-toc__group {
  margin: var(--ui-space-md) 0 var(--ui-space-xs);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  color: var(--ui-text-muted);
  text-transform: none;
}
.ui-settings-toc__group:first-child { margin-top: 0; }
/* Встроенный раздел — кнопка: сбрасываем вид кнопки до вида строки оглавления. */
button.ui-settings-toc__link {
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.ui-settings-toc__hint { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.ui-settings-toc__link[aria-current] {
  border-color: var(--ui-brand-600);
  background: var(--ui-surface-accent);
}

/* TPL-005 §7.5: настройки — оглавление слева, содержимое справа. */
.ui-settings {
  display: grid;
  grid-template-columns: var(--ui-settings-nav) 1fr;
  gap: var(--ui-space-xl);
  align-items: start;
}
.ui-settings__nav {
  position: sticky;
  top: var(--ui-space-lg);
}
/* В колонке оглавление идёт одной стопкой, а не плитками в несколько столбцов. */
.ui-settings__nav .ui-settings-toc {
  grid-template-columns: 1fr;
}
.ui-settings__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-lg);
  min-width: 0;
}
/* Выпадающий список нужен только телефону; на остальных ширинах его место — оглавление. */
.ui-settings__picker {
  display: none;
}
@media (max-width: 1024px) {
  .ui-settings {
    grid-template-columns: 1fr;
  }
  .ui-settings__nav {
    position: static;
  }
  /* Верхний ряд в ОДИН уровень: разделы уезжают вбок внутри оглавления, а не переносятся. */
  .ui-settings__nav .ui-settings-toc {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: minmax(180px, max-content);
    overflow-x: auto;
  }
}
@media (max-width: 480px) {
  .ui-settings__picker {
    display: grid;
    gap: var(--ui-space-xs);
  }
  .ui-settings__nav .ui-settings-toc {
    display: none;
  }
}
`;
