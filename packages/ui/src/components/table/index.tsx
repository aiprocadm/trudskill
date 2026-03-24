import type { ReactElement } from 'react';

export interface Column<T> { key: keyof T; title: string }

export function DataTable<T extends Record<string, unknown>>({ columns, rows }: { columns: Column<T>[]; rows: T[] }): ReactElement {
  return (
    <table>
      <thead><tr>{columns.map((c) => <th key={String(c.key)}>{c.title}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{columns.map((c) => <td key={String(c.key)}>{String(r[c.key] ?? '')}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
