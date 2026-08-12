import { resolveVisibleColumns } from './column-config.js';
import { selectionState, toggleAll, toggleKey } from './selection.js';

import type { RowKey } from './selection.js';
import type { ReactElement } from 'react';

export interface Column<T extends object> {
  key: keyof T;
  title: string;
  sortable?: boolean;
  render?: (row: T) => string | number | ReactElement | null | undefined;
}

/** Действие над одной строкой (CMP-001): показывается в последней колонке. */
export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function DataTable<T extends object>({
  columns: columnsSource,
  rows,
  stickyFirstColumn = false,
  sortBy,
  sortDir = 'asc',
  onSort,
  emptyMessage = 'Пока пусто',
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
                        {c.render ? c.render(r) : String(r[c.key] ?? '')}
                      </td>
                    )),
                    ...(showActions
                      ? [
                          <td key="__actions" data-label="Действия" className="ui-table-actions">
                            {rowActions(r).map((action) => (
                              <button
                                key={action.label}
                                type="button"
                                className={
                                  action.danger
                                    ? 'ui-button-link ui-button-link--danger'
                                    : 'ui-button-link'
                                }
                                onClick={action.onSelect}
                              >
                                {action.label}
                              </button>
                            ))}
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
