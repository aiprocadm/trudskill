import type { ReactElement } from 'react';

export interface Column<T extends object> {
  key: keyof T;
  title: string;
}

export function DataTable<T extends object>({
  columns,
  rows,
  stickyFirstColumn = false
}: {
  columns: Column<T>[];
  rows: T[];
  /** Закрепляет первую колонку при горизонтальном скролле широких таблиц. */
  stickyFirstColumn?: boolean;
}): ReactElement {
  const wrapClass = stickyFirstColumn ? 'ui-table-wrap ui-table-wrap--sticky-first' : 'ui-table-wrap';
  return (
    <div className={wrapClass}>
      <table className="ui-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={String(c.key)}>{c.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={String(c.key)}>{String(r[c.key] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
