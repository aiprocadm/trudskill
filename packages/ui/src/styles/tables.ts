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
/* CMP-001: выделение строк, действия строки, плотная раскладка. */
.ui-table-select { width: 1%; white-space: nowrap; }
.ui-table-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: var(--ui-brand-600); }
.ui-table-actions { width: 1%; white-space: nowrap; text-align: right; }
.ui-table-actions .ui-button-link + .ui-button-link { margin-left: var(--ui-space-md); }
.ui-button-link--danger { color: var(--ui-danger-600); }
.ui-table tbody tr[data-selected='true'] td { background: var(--ui-surface-accent); }
.ui-table tbody tr[data-selected='true']:hover td { background: var(--ui-surface-accent); }
.ui-table-wrap--compact .ui-table th,
.ui-table-wrap--compact .ui-table td { padding: 6px 11px; }
/* ФТ-H4 (Фаза 5): телефон ≤480px — таблица превращается в карточки.
   Горизонтальная прокрутка таблицы на 360px нечитаема; вместо неё каждая строка
   становится карточкой, а подпись ячейки берётся из data-label (его проставляет
   DataTable из заголовка колонки; колонка без заголовка — контент без подписи). */
@media (max-width: 480px) {
  .ui-table-wrap { border: none; border-radius: 0; overflow-x: visible; }
  .ui-table thead { display: none; }
  .ui-table, .ui-table tbody, .ui-table tr, .ui-table td { display: block; width: 100%; }
  .ui-table tr { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); padding: 8px 12px; }
  .ui-table tr + tr { margin-top: 10px; }
  .ui-table td { border-top: none; padding: 6px 0; word-break: break-word; }
  .ui-table td[data-label] { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .ui-table td[data-label]::before { content: attr(data-label); flex: none; font-size: 13px; font-weight: 600; color: var(--ui-text-muted); }
  .ui-table tbody tr:hover td { background: transparent; }
  /* Закрепление первой колонки не имеет смысла без горизонтальной прокрутки. */
  .ui-table-wrap--sticky-first .ui-table th:first-child,
  .ui-table-wrap--sticky-first .ui-table td:first-child { position: static; box-shadow: none; }
  /* CMP-001 на телефоне: выделение и действия — обычные строки карточки, тач-зона 44px. */
  .ui-table-select, .ui-table-actions { width: auto; text-align: left; }
  .ui-table-checkbox { width: 24px; height: 24px; }
  .ui-table td.ui-table-actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-md); }
  .ui-table td.ui-table-actions .ui-button-link { min-height: 44px; display: inline-flex; align-items: center; }
  .ui-table td.ui-table-actions .ui-button-link + .ui-button-link { margin-left: 0; }
}
`;
