export const layoutStyles = `
.ui-app-shell-main { min-width: 0; }
.ui-dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.ui-dashboard-tile {
  display: block;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
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
`;
