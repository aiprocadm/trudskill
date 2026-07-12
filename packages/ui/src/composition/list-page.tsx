import { AsyncSection } from './async-section';
import { FilterBar } from '../components/filters/index';
import { Pagination } from '../components/pagination/index';
import { DataTable } from '../components/table/index';

import type { Column } from '../components/table/index';
import type { ReactElement, ReactNode } from 'react';

export interface ListPageProps<T extends object> {
  filters?: ReactNode;
  columns: Column<T>[];
  rows: T[];
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyHint?: string;
  rowKey?: (row: T, index: number) => string | number;
  page?: number;
  totalPages?: number;
  onPageChange?: (next: number) => void;
}

// Каркас списочного экрана. PageHeader остаётся на уровне экрана (он во frontend).
export function ListPage<T extends object>({
  filters,
  columns,
  rows,
  isLoading,
  error,
  onRetry,
  emptyMessage,
  emptyHint,
  rowKey,
  page,
  totalPages,
  onPageChange
}: ListPageProps<T>): ReactElement {
  const showPagination =
    page !== undefined && totalPages !== undefined && onPageChange !== undefined;
  return (
    <div className="ui-stack">
      {filters ? <FilterBar>{filters}</FilterBar> : null}
      <AsyncSection
        isLoading={isLoading}
        error={error}
        isEmpty={rows.length === 0}
        {...(onRetry ? { onRetry } : {})}
        {...(emptyMessage ? { emptyMessage } : {})}
        {...(emptyHint ? { emptyHint } : {})}
      >
        <DataTable<T> columns={columns} rows={rows} {...(rowKey ? { rowKey } : {})} />
        {showPagination ? (
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        ) : null}
      </AsyncSection>
    </div>
  );
}
