import { AsyncSection } from './async-section.js';
import { FilterBar } from '../components/filters/index.js';
import { Pagination } from '../components/pagination/index.js';
import { DataTable } from '../components/table/index.js';

import type { EmptyStateAction } from '../components/states/index.js';
import type { Column, RowAction } from '../components/table/index.js';
import type { RowKey } from '../components/table/selection.js';
import type { ReactElement, ReactNode } from 'react';

export interface ListPageProps<T extends object> {
  /**
   * `CMP-012`: быстрые отборы — ПЕРВЫЙ блок списка (ТЗ 5.6 / Э6).
   *
   * Раньше экран рисовал их сам, рядом с каркасом, и порядок блоков был на совести
   * каждого экрана. Правило, которое обязан помнить каждый, соблюсти нельзя (урок Э1):
   * теперь блок приходит слотом, а порядок считает каркас.
   */
  savedViews?: ReactNode;
  /** Поиск и до трёх фильтров — первый ряд панели отбора. */
  filters?: ReactNode;
  /** `CMP-003`: остальные фильтры — под кнопкой «Ещё фильтры». */
  secondaryFilters?: ReactNode;
  /** Сколько фильтров сейчас задано — показывается на кнопке и включает «Сбросить». */
  activeFilterCount?: number;
  onResetFilters?: () => void;
  /** `CMP-002`: выбор колонок — в той же панели отбора, справа. */
  columnPicker?: ReactNode;
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
  /** `CMP-011`: массовые действия — ПОСЛЕДНИЙ блок, под таблицей (ТЗ 5.6 / Э6). */
  bulkBar?: ReactNode;
}

/**
 * Каркас списочного экрана: **один шаблон на все списки** (ТЗ 5.6 / Э6).
 *
 * Порядок блоков задаётся здесь и нигде больше: быстрые отборы → поиск и фильтры → выбор
 * колонок (в той же панели) → таблица → страницы → массовые действия. `PageHeader` остаётся
 * на уровне экрана: он не часть списка, а часть страницы.
 *
 * **Пагинация не показывается, когда страница одна** — «Назад 1 / 1 Вперёд» под списком из
 * одной строки сообщает ровно ничего и занимает место, которое человек читает как элемент
 * управления.
 */
export function ListPage<T extends object>({
  savedViews,
  filters,
  secondaryFilters,
  activeFilterCount,
  onResetFilters,
  columnPicker,
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
  bulkBar
}: ListPageProps<T>): ReactElement {
  const showPagination =
    page !== undefined && totalPages !== undefined && onPageChange !== undefined && totalPages > 1;
  const hasFilterBar = Boolean(filters) || Boolean(secondaryFilters) || Boolean(columnPicker);
  return (
    <div className="ui-stack">
      {savedViews ?? null}
      {hasFilterBar ? (
        <FilterBar
          {...(filters ? { primary: filters } : {})}
          {...(secondaryFilters ? { secondary: secondaryFilters } : {})}
          {...(activeFilterCount !== undefined ? { activeCount: activeFilterCount } : {})}
          {...(onResetFilters ? { onReset: onResetFilters } : {})}
          {...(columnPicker ? { extra: columnPicker } : {})}
        />
      ) : null}
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
      {bulkBar ?? null}
    </div>
  );
}
