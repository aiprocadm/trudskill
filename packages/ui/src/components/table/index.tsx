import { isValidElement } from 'react';

import { resolveVisibleColumns } from './column-config.js';
import { type RowAction, splitRowActions } from './row-actions.js';
import { selectionState, toggleAll, toggleKey } from './selection.js';
import { OverflowMenu } from '../overflow-menu/index.js';

import type { RowKey } from './selection.js';
import type { ReactElement, ReactNode } from 'react';

export interface Column<T extends object> {
  key: keyof T;
  title: string;
  sortable?: boolean;
  render?: (row: T) => string | number | ReactElement | null | undefined;
}

/*
 * Ячейка без `render`: готовый React-элемент (напр. ссылка на карточку) выводится как есть.
 * Раньше он попадал в String() и человек видел «[object Object]» вместо названия.
 */
const renderCellValue = (value: unknown): ReactNode =>
  isValidElement(value) ? value : String(value ?? '');

/*
 * Действие над одной строкой (CMP-001): последняя колонка. ТЗ 5.1: в строке — одно основное
 * действие, остальное в меню «…», опасные внизу отдельной секцией. Правило разбиения — чистая
 * функция `splitRowActions`, тип переехал туда же.
 */
export { type RowAction, type RowActionLayout, splitRowActions } from './row-actions.js';

/**
 * ТЗ 5.1 (Э1): в строке — одно основное действие, остальное в меню «…», опасные внизу отдельной
 * секцией. Раньше все действия печатались подряд подчёркнутыми ссылками: у арендаторов
 * платформы четыре в ряд, опасные красным вперемешку с обычными.
 */
const renderRowActions = (actions: RowAction[]): ReactNode => {
  const layout = splitRowActions(actions);
  const menu = [...layout.menu, ...layout.danger];
  return (
    <>
      {layout.inline ? (
        <button
          type="button"
          className="ui-button-link"
          onClick={layout.inline.onSelect}
          {...(layout.inline.disabled ? { disabled: true } : {})}
        >
          {layout.inline.label}
        </button>
      ) : null}
      {menu.length > 0 ? <OverflowMenu items={menu} /> : null}
    </>
  );
};

export function DataTable<T extends object>({
  columns: columnsSource,
  rows,
  stickyFirstColumn = false,
  sortBy,
  sortDir = 'asc',
  onSort,
  emptyMessage = 'Пока пусто',
  emptyHint,
  rowKey,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  rowActions,
  density = 'comfortable',
  visibleColumnKeys
}: {
  columns: Column<T>[];
  rows: T[];
  /** Закрепляет первую колонку при горизонтальном скролле широких таблиц. */
  stickyFirstColumn?: boolean;
  sortBy?: keyof T;
  sortDir?: 'asc' | 'desc';
  onSort?: (next: { key: keyof T; dir: 'asc' | 'desc' }) => void;
  emptyMessage?: string;
  /**
   * TPL-006: пустая таблица объясняет, что это за раздел и что сделать первым.
   * Отдельное свойство, а не часть сообщения: заголовок и пояснение читаются по-разному
   * и в вёрстке стоят на разных строках.
   */
  emptyHint?: string;
  /** Стабильный ключ строки; по умолчанию r.id/r.key, иначе индекс (fallback). */
  rowKey?: (row: T, index: number) => string | number;
  /* CMP-001. Всё ниже опционально: без этих свойств таблица ведёт себя как прежде —
     иначе сломались бы все 30 экранов, которые её уже используют. */
  selectable?: boolean;
  selectedKeys?: RowKey[];
  onSelectionChange?: (keys: RowKey[]) => void;
  rowActions?: (row: T) => RowAction[];
  density?: 'comfortable' | 'compact';
  /** CMP-002: какие колонки показывать. Не задано — показываются все. */
  visibleColumnKeys?: string[];
}): ReactElement {
  const allColumnKeys = columnsSource.map((c) => String(c.key));
  const visible = new Set(resolveVisibleColumns(allColumnKeys, visibleColumnKeys));
  const columns = columnsSource.filter((c) => visible.has(String(c.key)));
  const wrapClasses = ['ui-table-wrap'];
  if (stickyFirstColumn) wrapClasses.push('ui-table-wrap--sticky-first');
  if (density === 'compact') wrapClasses.push('ui-table-wrap--compact');

  const resolveRowKey = (row: T, index: number): string | number => {
    if (rowKey) return rowKey(row, index);
    const candidate = (row as Record<string, unknown>).id ?? (row as Record<string, unknown>).key;
    return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : index;
  };
  const getNextSortDir = (columnKey: keyof T): 'asc' | 'desc' => {
    if (sortBy !== columnKey) return 'asc';
    return sortDir === 'asc' ? 'desc' : 'asc';
  };

  const selection = selectedKeys ?? [];
  const pageKeys = rows.map((row, index) => resolveRowKey(row, index));
  const headerState = selectionState(selection, pageKeys);
  const showSelection = selectable && onSelectionChange !== undefined;
  const showActions = rowActions !== undefined;
  const totalColumns = columns.length + (showSelection ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className={wrapClasses.join(' ')}>
      <table className="ui-table">
        <thead>
          {/* Ячейки собираются одним списком, а не тернарниками с null: иначе в children
              появляются пустые места и структура разметки меняется даже при выключенных
              опциях — сторож foundation.test.tsx это ловит, и правильно. */}
          <tr>
            {[
              ...(showSelection
                ? [
                    <th key="__select" scope="col" className="ui-table-select">
                      <input
                        type="checkbox"
                        className="ui-table-checkbox"
                        aria-label="Выделить все строки на странице"
                        checked={headerState === 'all'}
                        ref={(node) => {
                          // «Часть строк выделена» невозможно выразить атрибутом — только из скрипта.
                          if (node) node.indeterminate = headerState === 'some';
                        }}
                        onChange={() => onSelectionChange?.(toggleAll(selection, pageKeys))}
                      />
                    </th>
                  ]
                : []),
              ...columns.map((c) => (
                <th key={String(c.key)} scope="col">
                  {c.sortable && onSort ? (
                    <button
                      type="button"
                      className="ui-table-sort"
                      aria-label={`Сортировать по ${c.title}`}
                      onClick={() => onSort({ key: c.key, dir: getNextSortDir(c.key) })}
                    >
                      {c.title}
                      {sortBy === c.key ? (
                        <span aria-hidden>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>
                      ) : null}
                    </button>
                  ) : (
                    c.title
                  )}
                </th>
              )),
              ...(showActions
                ? [
                    <th key="__actions" scope="col" className="ui-table-actions">
                      Действия
                    </th>
                  ]
                : [])
            ]}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={totalColumns} className="ui-text-muted">
                {emptyMessage}
                {emptyHint ? <p className="ui-empty-hint">{emptyHint}</p> : null}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => {
              const key = resolveRowKey(r, i);
              const isSelected = selection.includes(key);
              return (
                <tr key={key} {...(isSelected ? { 'data-selected': 'true' } : {})}>
                  {[
                    ...(showSelection
                      ? [
                          <td key="__select" data-label="Выделение" className="ui-table-select">
                            <input
                              type="checkbox"
                              className="ui-table-checkbox"
                              aria-label="Выделить строку"
                              checked={isSelected}
                              onChange={() => onSelectionChange?.(toggleKey(selection, key))}
                            />
                          </td>
                        ]
                      : []),
                    ...columns.map((c) => (
                      // data-label — подпись ячейки в карточном режиме на телефоне (≤480px);
                      // колонка без заголовка (действия) остаётся без подписи.
                      <td key={String(c.key)} {...(c.title ? { 'data-label': c.title } : {})}>
                        {c.render ? c.render(r) : renderCellValue(r[c.key])}
                      </td>
                    )),
                    ...(showActions
                      ? [
                          <td key="__actions" data-label="Действия" className="ui-table-actions">
                            {renderRowActions(rowActions(r))}
                          </td>
                        ]
                      : [])
                  ]}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
