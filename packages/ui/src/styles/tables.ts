export const tableStyles = `
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
`;
