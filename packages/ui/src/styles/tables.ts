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
.ui-table { width: 100%; border-collapse: collapse; font-size: var(--ui-font-size-sm); }
.ui-table th { text-align: left; background: var(--ui-surface-muted); color: var(--ui-text-muted); padding: 11px; font-weight: 600; white-space: nowrap; }
.ui-table td { border-top: 1px solid var(--ui-border); padding: 11px; color: var(--ui-text); vertical-align: middle; }
.ui-table tbody tr { transition: background var(--ui-duration-fast) var(--ui-ease); }
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
/* CMP-011: панель массовых действий — липкая полоса под списком. */
.ui-bulk-bar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-sm);
  padding: var(--ui-space-md);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-strong);
}
.ui-bulk-bar__row { display: flex; gap: var(--ui-space-sm); flex-wrap: wrap; align-items: center; }
.ui-bulk-bar__count { font-weight: var(--ui-font-weight-semibold); }
/* CMP-011: итог операции — та же разметка в панели реестра и на экране импорта. */
.ui-outcome p { margin: 0 0 var(--ui-space-xs); }
.ui-outcome__summary { font-weight: var(--ui-font-weight-semibold); }
.ui-outcome__failures { margin: 0; padding-left: var(--ui-space-lg); color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); display: grid; gap: var(--ui-space-xs); }
/* CMP-003: два ряда панели фильтров — видимые и раскрываемые «Ещё фильтры». */
.ui-filter-bar { flex-direction: column; align-items: stretch; }
.ui-filter-bar__row { display: flex; gap: var(--ui-space-sm); flex-wrap: wrap; align-items: center; }
.ui-filter-bar__row--secondary {
  padding-top: var(--ui-space-sm);
  border-top: 1px solid var(--ui-border);
}
/* CMP-002: выбор колонок. Список раскрывается под кнопкой в панели фильтров. */
.ui-column-picker { position: relative; display: inline-flex; }
.ui-column-picker__list {
  position: absolute;
  top: calc(100% + var(--ui-space-xs));
  left: 0;
  z-index: 20;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-xs);
  padding: var(--ui-space-md);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-strong);
}
.ui-column-picker__item { display: flex; align-items: center; gap: var(--ui-space-sm); font-size: var(--ui-font-size-sm); }
.ui-badge-count {
  margin-left: var(--ui-space-sm);
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-brand-600);
  color: var(--ui-on-accent, #fff);
  font-size: var(--ui-font-size-xs);
  line-height: 20px;
  display: inline-block;
  text-align: center;
}
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
  .ui-table td[data-label]::before { content: attr(data-label); flex: none; font-size: var(--ui-font-size-sm); font-weight: 600; color: var(--ui-text-muted); }
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
