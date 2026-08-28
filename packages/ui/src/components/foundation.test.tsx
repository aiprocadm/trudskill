import { AsyncTaskStatus } from '@trudskill/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { AsyncStatusWidget } from './async-status/index.js';
import { Pagination } from './pagination/index.js';
import { PermissionWrapper } from './permission/index.js';
import { DataTable } from './table/index.js';
import { handlerOf, propsOf } from '../testing/element.test-util.js';

import type { ReactElement } from 'react';

describe('ui foundation components', () => {
  it('PermissionWrapper renders children only when allowed', () => {
    const child = { type: 'span', props: { children: 'allowed' } } as ReactElement;
    const fallback = { type: 'span', props: { children: 'blocked' } } as ReactElement;

    const allowed = PermissionWrapper({ allowed: true, fallback, children: child });
    const denied = PermissionWrapper({ allowed: false, fallback, children: child });

    expect(propsOf(allowed).children).toBe(child);
    expect(denied).toBe(fallback);
  });

  it('Pagination guards first/last pages and emits next page callbacks', () => {
    const onPageChange = vi.fn();
    const pageOne = Pagination({ page: 1, totalPages: 3, onPageChange });
    const [prevBtnOnFirstPage] = propsOf(pageOne).children as ReactElement[];
    expect(propsOf(prevBtnOnFirstPage).disabled).toBe(true);

    const middlePage = Pagination({ page: 2, totalPages: 3, onPageChange });
    const [prevBtn, , nextBtn] = propsOf(middlePage).children as ReactElement[];
    handlerOf(prevBtn, 'onClick')();
    handlerOf(nextBtn, 'onClick')();

    const lastPage = Pagination({ page: 3, totalPages: 3, onPageChange });
    const [, , nextBtnOnLastPage] = propsOf(lastPage).children as ReactElement[];

    expect(propsOf(nextBtnOnLastPage).disabled).toBe(true);
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('AsyncStatusWidget renders localized async task label', () => {
    const widget = AsyncStatusWidget({ status: AsyncTaskStatus.Queued });
    const children = propsOf(widget).children as ReactElement[];
    const badge = children[0] as ReactElement;
    expect(String(propsOf(badge).children)).toContain('В очереди');
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

    const table = propsOf(wrap).children as ReactElement;
    const [head, body] = propsOf(table).children as ReactElement[];
    const headRow = propsOf(propsOf(head).children as ReactElement).children as ReactElement[];
    const bodyRows = propsOf(body).children as ReactElement[];

    expect(headRow).toHaveLength(2);
    expect(bodyRows).toHaveLength(2);
    expect(
      propsOf((propsOf(bodyRows[0]).children as ReactElement[])[0] as ReactElement).children
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
    const table = propsOf(wrap).children as ReactElement;
    const [head, body] = propsOf(table).children as ReactElement[];
    const headRow = propsOf(propsOf(head).children as ReactElement).children as ReactElement[];
    const sortButton = propsOf(headRow[0] as ReactElement).children as ReactElement;
    handlerOf(sortButton, 'onClick')();
    expect(onSort).toHaveBeenCalledWith({ key: 'name', dir: 'desc' });

    const emptyRow = propsOf(body).children as ReactElement;
    const emptyCell = propsOf(emptyRow).children as ReactElement;
    // Ячейка пустой таблицы теперь несёт две части: сообщение и (если задано) пояснение.
    const [message, hint] = propsOf(emptyCell).children as [string, ReactElement | null];
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
    const table = propsOf(wrap).children as ReactElement;
    const [, body] = propsOf(table).children as ReactElement[];
    const emptyCell = propsOf(propsOf(body).children as ReactElement).children as ReactElement;
    const [message, hint] = propsOf(emptyCell).children as [string, ReactElement];
    expect(message).toBe('Задач нет');
    expect(propsOf(hint).children).toBe('Задачи появляются по ходу обучения группы.');
    expect(propsOf(hint).className).toBe('ui-empty-hint');
  });
});
