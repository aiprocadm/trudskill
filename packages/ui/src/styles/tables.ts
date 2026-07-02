export const tableStyles = `
.ui-table-wrap { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); overflow-x: auto; }
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
.ui-table th { text-align: left; background: var(--ui-surface-muted); color: var(--ui-text-muted); padding: 11px; font-weight: 600; white-space: nowrap; }
.ui-table td { border-top: 1px solid var(--ui-border); padding: 11px; color: var(--ui-text); vertical-align: middle; }
.ui-table tbody tr { transition: background .12s ease; }
.ui-table tbody tr:hover td { background: var(--ui-surface-muted); }
/* Кнопка сортировки в заголовке — сброс дефолтного вида <button> (рамка/высота протекали из глобального стиля) */
.ui-table-sort { background: none; border: none; padding: 0; height: auto; font: inherit; font-weight: 600; color: var(--ui-text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 2px; }
.ui-table-sort:hover { color: var(--ui-text); background: none; }
`;
