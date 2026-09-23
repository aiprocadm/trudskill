import { describe, expect, it } from 'vitest';

import { COMMON_SORT_COLUMNS, likePattern, parseRegistryListQuery } from './registry-list-query.js';

/**
 * Разбор параметров списка для SQL-репозиториев (Фаза 1, срез 1b) повторяет `MvpService.list`
 * (журнал 277, решение Р16): строки с проволоки, потолок 200 только для них, по умолчанию 50.
 */
describe('parseRegistryListQuery', () => {
  it('страница и размер: строки с проволоки режутся потолком 200, числа изнутри — нет', () => {
    expect(parseRegistryListQuery({}, COMMON_SORT_COLUMNS)).toMatchObject({
      page: 1,
      pageSize: 50
    });
    expect(
      parseRegistryListQuery({ page: '2', page_size: '20' } as never, COMMON_SORT_COLUMNS)
    ).toMatchObject({ page: 2, pageSize: 20 });
    expect(
      parseRegistryListQuery({ page_size: '5000' } as never, COMMON_SORT_COLUMNS).pageSize
    ).toBe(200);
    expect(parseRegistryListQuery({ page_size: 1000 }, COMMON_SORT_COLUMNS).pageSize).toBe(1000);
    expect(
      parseRegistryListQuery({ page: 'abc', page_size: '0' } as never, COMMON_SORT_COLUMNS)
    ).toMatchObject({ page: 1, pageSize: 50 });
  });

  it('сортировка — только по белому списку, направление по умолчанию asc', () => {
    expect(parseRegistryListQuery({ sort: 'name:desc' }, COMMON_SORT_COLUMNS).sort).toEqual({
      column: 'name',
      direction: 'desc'
    });
    expect(parseRegistryListQuery({ sort: 'createdAt' }, COMMON_SORT_COLUMNS).sort).toEqual({
      column: 'created_at',
      direction: 'asc'
    });
    // Поле не из списка — сортировки нет (порядок по умолчанию), а не SQL с чужим именем.
    expect(
      parseRegistryListQuery({ sort: 'payload:asc' }, COMMON_SORT_COLUMNS).sort
    ).toBeUndefined();
    expect(
      parseRegistryListQuery({ sort: 'name; drop table x' }, COMMON_SORT_COLUMNS).sort
    ).toBeUndefined();
  });

  it('поиск и статус обрезаются, пустые — не попадают в запрос; скоуп только при ограничении', () => {
    const parsed = parseRegistryListQuery(
      { q: '  Ромашка ', status: 'active' },
      COMMON_SORT_COLUMNS,
      { counterpartyId: 'cp1' }
    );
    expect(parsed).toMatchObject({ q: 'Ромашка', status: 'active', counterpartyId: 'cp1' });
    const empty = parseRegistryListQuery({ q: '   ', status: '' }, COMMON_SORT_COLUMNS);
    expect(empty.q).toBeUndefined();
    expect(empty.status).toBeUndefined();
    expect(empty.counterpartyId).toBeUndefined();
  });

  it('шаблон ilike экранирует спецсимволы, чтобы «100%» искал проценты, а не всё подряд', () => {
    expect(likePattern('100%')).toBe('%100\\%%');
    expect(likePattern('a_b\\c')).toBe('%a\\_b\\\\c%');
  });
});
