import type { ReactElement } from 'react';

export interface Column<T extends object> {
  key: keyof T;
  title: string;
  sortable?: boolean;
  render?: (row: T) => string | number | ReactElement | null | undefined;
}

export function DataTable<T extends object>({
  columns,
  rows,
  stickyFirstColumn = false,
  sortBy,
  sortDir = 'asc',
  onSort,
  emptyMessage = 'Нет данных'
}: {
  columns: Column<T>[];
  rows: T[];
  /** Закрепляет первую колонку при горизонтальном скролле широких таблиц. */
  stickyFirstColumn?: boolean;
  sortBy?: keyof T;
  sortDir?: 'asc' | 'desc';
  onSort?: (next: { key: keyof T; dir: 'asc' | 'desc' }) => void;
  emptyMessage?: string;
}): ReactElement {
  const wrapClass = stickyFirstColumn ? 'ui-table-wrap ui-table-wrap--sticky-first' : 'ui-table-wrap';
  const getNextSortDir = (columnKey: keyof T): 'asc' | 'desc' => {
    if (sortBy !== columnKey) return 'asc';
    return sortDir === 'asc' ? 'desc' : 'asc';
  };

  return (
    <div className={wrapClass}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((c) => (
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
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ui-text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={String(c.key)}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
