'use client';

import { type PropsWithChildren, type ReactElement, useMemo } from 'react';

import { lightThemeVars } from '../tokens';

const css = `
[data-ui-theme='light'] { background: var(--ui-bg); color: var(--ui-text); min-height: 100vh; }
* { box-sizing: border-box; }
.ui-page,.ui-page-container { display: grid; gap: 16px; padding: 20px; }
.ui-page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.ui-page-title { margin:0; font-size: 1.5rem; }
.ui-page-subtitle { margin:4px 0 0; color: var(--ui-text-muted); }
.ui-section-card,.ui-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 14px; box-shadow: var(--ui-shadow); }
.ui-section-card { padding: 16px; display:grid; gap:12px; }
.ui-section-title { margin:0; font-size: 1rem; }
.ui-empty,.ui-error,.ui-loading { border: 1px dashed var(--ui-border); border-radius: 10px; background: var(--ui-surface-muted); padding: 14px; color: var(--ui-text-muted); }
.ui-error { border-color: #fecaca; color: var(--ui-danger-600); }
.ui-filter-bar,.ui-inline,.ui-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.ui-stack { display:flex; flex-direction:column; gap:12px; }
.ui-input,.ui-select,.ui-textarea,input,select,textarea { height: 38px; border: 1px solid var(--ui-border); border-radius: 10px; padding: 0 10px; background: var(--ui-surface); color: var(--ui-text); }
textarea,.ui-textarea { min-height: 84px; padding: 8px 10px; }
button,.ui-button { height: 38px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface); padding: 0 12px; cursor: pointer; transition: all .15s ease; }
button:hover,.ui-button:hover { background: var(--ui-surface-muted); }
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-button--primary { background: var(--ui-brand-600); border-color: var(--ui-brand-600); color:#fff; }
.ui-button--primary:hover { background: var(--ui-brand-700); }
.ui-table-wrap { border: 1px solid var(--ui-border); border-radius: 12px; overflow-x: auto; }
.ui-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ui-table th { text-align: left; background: var(--ui-surface-muted); color: var(--ui-text-muted); padding: 11px; }
.ui-table td { border-top: 1px solid var(--ui-border); padding: 11px; }
.ui-badge { color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
@media (max-width: 1024px){ .ui-page,.ui-page-container{padding:16px;} }
`;

export const UiThemeProvider = ({ children }: PropsWithChildren): ReactElement => {
  const vars = useMemo(
    () => Object.entries(lightThemeVars).map(([key, value]) => [key, value] as const),
    []
  );

  return (
    <div data-ui-theme="light" style={Object.fromEntries(vars)}>
      <style>{css}</style>
      {children}
    </div>
  );
};
