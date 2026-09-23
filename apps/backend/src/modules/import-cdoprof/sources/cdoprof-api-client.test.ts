import { describe, expect, it } from 'vitest';

import { CdoprofApiClient } from './cdoprof-api-client.js';
import { FixtureCdoprofTransport, loadFixtureDataset } from './fixture-cdoprof-transport.js';

import type { CdoprofApiError, CdoprofQuery, CdoprofTransport } from './cdoprof-transport.js';

const collect = async <T>(iterator: AsyncGenerator<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of iterator) out.push(item);
  return out;
};

describe('CdoprofApiClient на фикстурах', () => {
  const dataset = loadFixtureDataset();

  it('итератор собирает все элементы через несколько страниц', async () => {
    const transport = new FixtureCdoprofTransport(dataset);
    const client = new CdoprofApiClient(transport, { pageLimit: 3 });

    const students = await collect(client.iterateStudents());

    expect(students.map((s) => s.id)).toEqual(dataset.students.map((s) => s.id));
    expect(transport.calls.filter((c) => c.method === 'student.get')).toHaveLength(3);
    expect(transport.calls[0]?.query).toMatchObject({ page: 1, limit: 3 });
  });

  it('размер страницы не превышает потолок источника 100', async () => {
    const transport = new FixtureCdoprofTransport(dataset);
    const client = new CdoprofApiClient(transport, { pageLimit: 500 });

    await client.listGroups(1);

    expect(transport.calls[0]?.query.limit).toBe(100);
  });

  it('передаёт поиск и колонку поиска как в API', async () => {
    const transport = new FixtureCdoprofTransport(dataset);
    const client = new CdoprofApiClient(transport);

    const page = await client.listCourses(1, { search: 'R13', searchColumn: 'cod' });

    expect(page.items.map((c) => c.cod)).toEqual(['R13.Б', 'R13.А']);
    expect(transport.calls[0]?.query).toMatchObject({ search: 'R13', search_column: 'cod' });
  });

  it('byInn находит контрагента, студенты фильтруются по контрагенту', async () => {
    const client = new CdoprofApiClient(new FixtureCdoprofTransport(dataset));

    const byInn = await client.getContragentByInn('770000000001');
    const students = await collect(client.iterateContragentStudents(101));

    expect(byInn.items.map((c) => c.id)).toEqual([102]);
    expect(students.map((s) => s.id)).toEqual([1001, 1002, 1003, 1008]);
  });

  it('обучения по контрагенту нормализованы; без обучений — пустой список', async () => {
    const client = new CdoprofApiClient(new FixtureCdoprofTransport(dataset));

    const withTrainings = await client.getContragentTrainings(101);
    const without = await client.getContragentTrainings(103);

    expect(withTrainings.contragent?.id).toBe(101);
    expect(withTrainings.items).toHaveLength(4);
    expect(withTrainings.items[0]?.trainings[0]?.result?.result_rus).toBe('Сдал');
    expect(without.items).toEqual([]);
  });

  it('неизвестный метод у фикстур — ошибка unknown_method', async () => {
    const transport = new FixtureCdoprofTransport(dataset);

    const error = await transport.get('report.endcert').catch((e: unknown) => e);

    expect((error as CdoprofApiError).code).toBe('unknown_method');
  });
});

describe('CdoprofApiClient — остановка обхода страниц', () => {
  const pageOf = (ids: number[], pagination: Record<string, unknown>) => ({
    success: true,
    data: { items: ids.map((id) => ({ id })), pagination }
  });

  const scripted = (pages: unknown[]): CdoprofTransport & { requested: number[] } => {
    const requested: number[] = [];
    return {
      requested,
      async get(_method: string, query: CdoprofQuery = {}) {
        const page = Number(query.page);
        requested.push(page);
        return pages[page - 1] ?? pageOf([], { page, limit: 100, total: 0, pages: 0 });
      }
    };
  };

  it('останавливается при has_next === false, даже если pages больше', async () => {
    const transport = scripted([
      pageOf([1, 2], { page: 1, limit: 2, total: 4, pages: 9, has_next: true }),
      pageOf([3, 4], { page: 2, limit: 2, total: 4, pages: 9, has_next: false })
    ]);
    const client = new CdoprofApiClient(transport, { pageLimit: 2 });

    const items = await collect(client.iterateGroups());

    expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4]);
    expect(transport.requested).toEqual([1, 2]);
  });

  it('останавливается на пустой странице, даже если has_next === true', async () => {
    const transport = scripted([
      pageOf([1], { page: 1, limit: 1, total: 1, pages: 5, has_next: true }),
      pageOf([], { page: 2, limit: 1, total: 1, pages: 5, has_next: true })
    ]);
    const client = new CdoprofApiClient(transport, { pageLimit: 1 });

    const items = await collect(client.iterateGroups());

    expect(items.map((i) => i.id)).toEqual([1]);
    expect(transport.requested).toEqual([1, 2]);
  });

  it('останавливается при page >= pages, даже если has_next === true', async () => {
    const transport = scripted([
      pageOf([1], { page: 1, limit: 1, total: 2, pages: 2, has_next: true }),
      pageOf([2], { page: 2, limit: 1, total: 2, pages: 2, has_next: true }),
      pageOf([3], { page: 3, limit: 1, total: 2, pages: 2, has_next: true })
    ]);
    const client = new CdoprofApiClient(transport, { pageLimit: 1 });

    const items = await collect(client.iterateGroups());

    expect(items.map((i) => i.id)).toEqual([1, 2]);
    expect(transport.requested).toEqual([1, 2]);
  });

  it('без has_next обход идёт по pages', async () => {
    const transport = scripted([
      pageOf([1], { page: 1, limit: 1, total: 2, pages: 2 }),
      pageOf([2], { page: 2, limit: 1, total: 2, pages: 2 })
    ]);
    const client = new CdoprofApiClient(transport, { pageLimit: 1 });

    const items = await collect(client.iterateGroups());

    expect(items.map((i) => i.id)).toEqual([1, 2]);
  });
});
