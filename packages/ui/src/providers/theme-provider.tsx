'use client';

import {
  type CSSProperties,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import { darkThemeVars, lightThemeVars } from '../tokens';

import { UI_THEME_STORAGE_KEY, UiThemeContextProvider, type UiThemeChoice } from './theme-context';

const css = `
[data-ui-theme] { background: var(--ui-bg); color: var(--ui-text); min-height: 100vh; }
* { box-sizing: border-box; }
.ui-page,.ui-page-container { display: grid; gap: 16px; padding: 20px; }
.ui-page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.ui-page-title { margin:0; font-size: 1.5rem; font-weight: 650; letter-spacing: -0.02em; line-height: 1.25; }
.ui-page-subtitle { margin:4px 0 0; color: var(--ui-text-muted); font-size: 0.95rem; line-height: 1.45; }
.ui-section-card,.ui-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 14px; box-shadow: var(--ui-shadow); }
.ui-section-card { padding: 16px; display:grid; gap:12px; }
.ui-section-title { margin:0; font-size: 1rem; font-weight: 600; }
.ui-empty,.ui-error,.ui-loading { border: 1px dashed var(--ui-border); border-radius: 10px; background: var(--ui-surface-muted); padding: 14px; color: var(--ui-text-muted); }
.ui-error { border-color: var(--ui-error-border); color: var(--ui-danger-600); }
.ui-empty-hint { margin: 10px 0 0; font-size: 0.875rem; line-height: 1.45; color: var(--ui-text-muted); }
.ui-filter-bar,.ui-inline,.ui-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.ui-stack { display:flex; flex-direction:column; gap:12px; }
.ui-input,.ui-select,.ui-textarea,input,select,textarea { height: 38px; border: 1px solid var(--ui-border); border-radius: 10px; padding: 0 10px; background: var(--ui-surface); color: var(--ui-text); }
textarea,.ui-textarea { min-height: 84px; padding: 8px 10px; }
button,.ui-button { height: 38px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface); padding: 0 12px; cursor: pointer; transition: background .15s ease, border-color .15s ease; color: var(--ui-text); }
button:hover,.ui-button:hover { background: var(--ui-surface-muted); }
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-button--primary { background: var(--ui-brand-600); border-color: var(--ui-brand-600); color:#fff; }
.ui-button--primary:hover { background: var(--ui-brand-700); }
.ui-table-wrap { border: 1px solid var(--ui-border); border-radius: 12px; overflow-x: auto; }
.ui-table-wrap--sticky-first { overflow-x: auto; }
.ui-table-wrap--sticky-first .ui-table th:first-child,
.ui-table-wrap--sticky-first .ui-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--ui-surface);
  box-shadow: 1px 0 0 var(--ui-border);
}
.ui-table-wrap--sticky-first .ui-table thead th:first-child {
  background: var(--ui-surface-muted);
}
.ui-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ui-table th { text-align: left; background: var(--ui-surface-muted); color: var(--ui-text-muted); padding: 11px; }
.ui-table td { border-top: 1px solid var(--ui-border); padding: 11px; }
.ui-badge { color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
.ui-badge--brand { background: var(--ui-brand-600); }
.ui-text-muted { color: var(--ui-text-muted); }
.ui-prose-muted { margin: 0; color: var(--ui-text-muted); line-height: 1.55; }
.ui-prose-muted--tight { margin: 0 0 12px; }
.ui-list-row { padding: 10px 0; border-bottom: 1px solid var(--ui-border); }
.ui-list-row:last-child { border-bottom: none; }
.ui-list-row-meta { font-size: 13px; color: var(--ui-text-muted); margin-top: 4px; }
.ui-login-center { min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
.ui-login-card { width: 360px; max-width: 100%; }
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
.ui-skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--ui-surface-muted) 25%, var(--ui-border) 50%, var(--ui-surface-muted) 75%);
  background-size: 200% 100%;
  animation: ui-skeleton-shimmer 1.2s ease-in-out infinite;
}
.ui-skeleton-block { display: grid; gap: 10px; padding: 4px 0; }
@keyframes ui-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.ui-app-shell-main { min-width: 0; }
.ui-ordered-list { margin: 0; padding-left: 20px; color: var(--ui-text-muted); line-height: 1.65; }
.ui-code-block { margin: 0; overflow: auto; font-size: 13px; background: var(--ui-surface-muted); padding: 12px; border-radius: 10px; border: 1px solid var(--ui-border); color: var(--ui-text); }
.ui-centered-page { min-height: 100vh; display: grid; place-items: center; padding: 20px; text-align: center; box-sizing: border-box; }
.ui-centered-card { max-width: 420px; width: 100%; }
.ui-centered-stack { display: grid; gap: 10px; justify-items: center; }
.ui-login-center { min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
.ui-login-card { width: 360px; max-width: 100%; }
.ui-system-title { margin: 0 0 8px; font-size: 2rem; font-weight: 650; }
.ui-system-text { margin: 0 0 16px; color: var(--ui-text-muted); line-height: 1.5; }
.ui-link-primary { color: var(--ui-brand-700); font-weight: 600; text-decoration: underline; }
.ui-link-primary:hover { color: var(--ui-brand-600); }
.ui-chat-layout { display: grid; grid-template-columns: minmax(220px, 280px) 1fr; min-height: calc(100vh - 64px); align-items: stretch; }
.ui-chat-sidebar { border-right: 1px solid var(--ui-border); padding: 12px; background: var(--ui-surface-muted); overflow: auto; }
.ui-chat-sidebar-title { margin: 0 0 10px; font-size: 1rem; }
.ui-chat-dialog-btn { display: block; width: 100%; text-align: left; margin-bottom: 6px; }
.ui-chat-main { display: grid; grid-template-rows: 1fr auto; padding: 12px; gap: 12px; min-width: 0; background: var(--ui-surface); }
.ui-chat-messages { overflow: auto; max-height: calc(100vh - 200px); }
.ui-chat-msg { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
.ui-chat-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ui-modal-root { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 16px; }
.ui-modal-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.45); }
.ui-modal-panel { position: relative; z-index: 1; width: min(440px, 100%); max-height: min(90vh, 640px); overflow: auto; background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 14px; padding: 20px; box-shadow: var(--ui-shadow-strong); display: grid; gap: 14px; }
.ui-modal-title { margin: 0; font-size: 1.15rem; }
.ui-modal-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
@media (max-width: 1024px) {
  .ui-page,.ui-page-container{padding:16px;}
  .ui-chat-layout { grid-template-columns: 1fr; min-height: auto; }
  .ui-chat-sidebar { border-right: 0; border-bottom: 1px solid var(--ui-border); max-height: 40vh; }
}
`;

export const UiThemeProvider = ({ children }: PropsWithChildren): ReactElement => {
  const [choice, setChoiceState] = useState<UiThemeChoice>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        setChoiceState(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' =
    !mounted ? 'light' : choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  const setChoice = useCallback((value: UiThemeChoice) => {
    setChoiceState(value);
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const themeValue = useMemo(
    () => ({
      choice,
      resolved,
      setChoice
    }),
    [choice, resolved, setChoice]
  );

  const vars = useMemo(() => {
    const source = resolved === 'dark' ? darkThemeVars : lightThemeVars;
    return Object.fromEntries(Object.entries(source)) as CSSProperties;
  }, [resolved]);

  return (
    <UiThemeContextProvider value={themeValue}>
      <div data-ui-theme={resolved} style={vars}>
        <style>{css}</style>
        {children}
      </div>
    </UiThemeContextProvider>
  );
};
