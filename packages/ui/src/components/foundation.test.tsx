import { AsyncTaskStatus } from '@trudskill/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { AsyncStatusWidget } from './async-status/index.js';
import { Pagination } from './pagination/index.js';
import { PermissionWrapper } from './permission/index.js';
import { DataTable } from './table/index.js';

import type { ReactElement } from 'react';

describe('ui foundation components', () => {
  it('PermissionWrapper renders children only when allowed', () => {
    const child = { type: 'span', props: { children: 'allowed' } } as ReactElement;
    const fallback = { type: 'span', props: { children: 'blocked' } } as ReactElement;

    const allowed = PermissionWrapper({ allowed: true, fallback, children: child });
    const denied = PermissionWrapper({ allowed: false, fallback, children: child });

    expect(allowed?.props.children).toBe(child);
    expect(denied).toBe(fallback);
  });

  it('Pagination guards first/last pages and emits next page callbacks', () => {
    const onPageChange = vi.fn();
    const pageOne = Pagination({ page: 1, totalPages: 3, onPageChange });
    const [prevBtnOnFirstPage] = pageOne.props.children as ReactElement[];
    expect(prevBtnOnFirstPage.props.disabled).toBe(true);

    const middlePage = Pagination({ page: 2, totalPages: 3, onPageChange });
    const [prevBtn, , nextBtn] = middlePage.props.children as ReactElement[];
    prevBtn.props.onClick();
    nextBtn.props.onClick();

    const lastPage = Pagination({ page: 3, totalPages: 3, onPageChange });
    const [, , nextBtnOnLastPage] = lastPage.props.children as ReactElement[];

    expect(nextBtnOnLastPage.props.disabled).toBe(true);
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('AsyncStatusWidget renders localized async task label', () => {
    const widget = AsyncStatusWidget({ status: AsyncTaskStatus.Queued });
    const children = widget.props.children as ReactElement[];
    const badge = children[0] as ReactElement;
    expect(String(badge.props.children)).toContain('В очереди');
  });

  it('DataTable renders provided columns and rows', () => {
    const wrap = DataTable({
      columns: [
        { key: 'name', title: 'Name' },
        { key: 'status', title: 'Status' }
      ],
      rows: [
        { name: 'Template A', status: 'active' },
        { name: 'Template B', status: 'archived' }
      ]
    });

    const table = wrap.props.children as ReactElement;
    const [head, body] = table.props.children as ReactElement[];
    const headRow = (head.props.children as ReactElement).props.children as ReactElement[];
    const bodyRows = body.props.children as ReactElement[];

    expect(headRow).toHaveLength(2);
    expect(bodyRows).toHaveLength(2);
    expect(
      ((bodyRows[0]?.props.children as ReactElement[])[0] as ReactElement).props.children
    ).toBe('Template A');
  });

  it('DataTable supports sortable headers and empty state', () => {
    const onSort = vi.fn();
    const wrap = DataTable({
      columns: [{ key: 'name', title: 'Название', sortable: true }],
      rows: [],
      sortBy: 'name',
      sortDir: 'asc',
      onSort,
      emptyMessage: 'Пусто'
    });
    const table = wrap.props.children as ReactElement;
    const [head, body] = table.props.children as ReactElement[];
    const headRow = (head.props.children as ReactElement).props.children as ReactElement[];
    const sortButton = (headRow[0] as ReactElement).props.children as ReactElement;
    sortButton.props.onClick();
    expect(onSort).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });

    const emptyRow = body.props.children as ReactElement;
    const emptyCell = emptyRow.props.children as ReactElement;
    // Ячейка пустой таблицы теперь несёт две части: сообщение и (если задано) пояснение.
    const [message, hint] = emptyCell.props.children as [string, ReactElement | null];
    expect(message).toBe('Пусто');
    expect(hint).toBeNull();
  });

  /*
   * TPL-006: пустая таблица объясняет, что это за раздел. Раньше `DataTable` умела только
   * сообщение, и экран, переведённый на неё, терял пояснение — сторож пустых состояний
   * этого не видел, потому что искал только тег `SectionEmpty`.
   */
  it('DataTable показывает пояснение к пустому состоянию, когда оно задано', () => {
    const wrap = DataTable({
      columns: [{ key: 'name', title: 'Название' }],
      rows: [],
      emptyMessage: 'Задач нет',
      emptyHint: 'Задачи появляются по ходу обучения группы.'
    });
    const table = wrap.props.children as ReactElement;
    const [, body] = table.props.children as ReactElement[];
    const emptyCell = (body.props.children as ReactElement).props.children as ReactElement;
    const [message, hint] = emptyCell.props.children as [string, ReactElement];
    expect(message).toBe('Задач нет');
    expect(hint.props.children).toBe('Задачи появляются по ходу обучения группы.');
    expect(hint.props.className).toBe('ui-empty-hint');
  });
});
