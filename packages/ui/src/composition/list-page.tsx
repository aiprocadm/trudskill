import { AsyncSection } from './async-section.js';
import { FilterBar } from '../components/filters/index.js';
import { Pagination } from '../components/pagination/index.js';
import { DataTable } from '../components/table/index.js';

import type { EmptyStateAction } from '../components/states/index.js';
import type { Column, RowAction } from '../components/table/index.js';
import type { RowKey } from '../components/table/selection.js';
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
  /** TPL-006: что сделать первым, когда список пуст. */
  emptyAction?: EmptyStateAction;
  /** CMP-001: действия строки — в своей колонке, а не кнопками внутри данных. */
  rowActions?: (row: T) => RowAction[];
  rowKey?: (row: T, index: number) => string | number;
  page?: number;
  totalPages?: number;
  onPageChange?: (next: number) => void;
  /**
   * Выделение строк и настройка колонок (`CMP-001`, `CMP-002`).
   *
   * Появились в волне 4 `GOAL-4`. До неё каркас их не умел — и эталонные реестры
   * (слушатели, группы) не могли на него переехать, не потеряв массовые операции. Каркас,
   * которым не может пользоваться эталон, — это не общий каркас, а ещё один частный
   * случай; поэтому расширяется он, а не переписываются экраны.
   */
  selectable?: boolean;
  selectedKeys?: RowKey[];
  onSelectionChange?: (keys: RowKey[]) => void;
  visibleColumnKeys?: string[];
  /** Полоса массовых действий и панель настройки колонок — рисуются экраном. */
  toolbar?: ReactNode;
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
  emptyAction,
  rowActions,
  rowKey,
  page,
  totalPages,
  onPageChange,
  selectable,
  selectedKeys,
  onSelectionChange,
  visibleColumnKeys,
  toolbar
}: ListPageProps<T>): ReactElement {
  const showPagination =
    page !== undefined && totalPages !== undefined && onPageChange !== undefined;
  return (
    <div className="ui-stack">
      {filters ? <FilterBar>{filters}</FilterBar> : null}
      {toolbar ?? null}
      <AsyncSection
        isLoading={isLoading}
        error={error}
        isEmpty={rows.length === 0}
        {...(onRetry ? { onRetry } : {})}
        {...(emptyMessage ? { emptyMessage } : {})}
        {...(emptyHint ? { emptyHint } : {})}
        {...(emptyAction ? { emptyAction } : {})}
      >
        <DataTable<T>
          columns={columns}
          rows={rows}
          {...(rowKey ? { rowKey } : {})}
          {...(rowActions ? { rowActions } : {})}
          {...(selectable ? { selectable } : {})}
          {...(selectedKeys ? { selectedKeys } : {})}
          {...(onSelectionChange ? { onSelectionChange } : {})}
          {...(visibleColumnKeys ? { visibleColumnKeys } : {})}
        />
        {showPagination ? (
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        ) : null}
      </AsyncSection>
    </div>
  );
}
