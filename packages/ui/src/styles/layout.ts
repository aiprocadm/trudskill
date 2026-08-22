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
.ui-settings-toc__hint { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
`;
