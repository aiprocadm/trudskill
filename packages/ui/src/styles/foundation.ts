export const foundationStyles = `
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
.ui-badge { color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
.ui-badge--brand { background: var(--ui-brand-600); }
.ui-text-muted { color: var(--ui-text-muted); }
.ui-prose-muted { margin: 0; color: var(--ui-text-muted); line-height: 1.55; }
.ui-prose-muted--tight { margin: 0 0 12px; }
.ui-list-row { padding: 10px 0; border-bottom: 1px solid var(--ui-border); }
.ui-list-row:last-child { border-bottom: none; }
.ui-list-row-meta { font-size: 13px; color: var(--ui-text-muted); margin-top: 4px; }
.ui-stepper { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
.ui-step { border: 1px solid var(--ui-border); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--ui-text-muted); background: var(--ui-surface-muted); }
.ui-step--active { color: #fff; border-color: var(--ui-brand-600); background: var(--ui-brand-600); }
.ui-step--done { color: #fff; border-color: var(--ui-success-600); background: var(--ui-success-600); }
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
@keyframes ui-spin { to { transform: rotate(360deg); } }
.ui-ordered-list { margin: 0; padding-left: 20px; color: var(--ui-text-muted); line-height: 1.65; }
.ui-code-block { margin: 0; overflow: auto; font-size: 13px; background: var(--ui-surface-muted); padding: 12px; border-radius: 10px; border: 1px solid var(--ui-border); color: var(--ui-text); }
.ui-link-primary { color: var(--ui-brand-700); font-weight: 600; text-decoration: underline; }
.ui-link-primary:hover { color: var(--ui-brand-600); }
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
@media (max-width: 1024px) {
  .ui-page,.ui-page-container{padding:16px;}
}
@media (max-width: 768px) {
  .ui-page-header { flex-direction: column; align-items: flex-start; }
  .ui-filter-bar,.ui-inline,.ui-toolbar { align-items: stretch; }
  .ui-filter-bar > *,
  .ui-toolbar > * { width: 100%; }
}
`;
