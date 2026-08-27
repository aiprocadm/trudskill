import { describe, expect, it } from 'vitest';

import { DOCUMENTS_HTTP_MAX_PAGE_SIZE, capHttpPageSize } from './http-page-cap.js';

/*
 * Ревизия 2026-08-27 (порция 34, журнал 283): потолок размера страницы принадлежит
 * ГРАНИЦЕ HTTP. Внутрь его ставить нельзя — портал заказчика фильтрует по контрагенту
 * ДО пагинации и законно просит всё сразу; снаружи же `?page_size=1000000` не должен
 * выносить весь реестр документов центра одним ответом.
 */
describe('потолок страницы на границе документов (порция 34)', () => {
  it('огромный размер обрезается до потолка', () => {
    expect(capHttpPageSize({ pageSize: 1_000_000 }).pageSize).toBe(DOCUMENTS_HTTP_MAX_PAGE_SIZE);
  });

  it('строковый размер с проволоки тоже обрезается', () => {
    const capped = capHttpPageSize({ pageSize: '5000' } as unknown as { pageSize?: number });
    expect(capped.pageSize).toBe(DOCUMENTS_HTTP_MAX_PAGE_SIZE);
  });

  it('обычный размер не трогается — и объект остаётся тем же', () => {
    const query = { pageSize: 20, search: 'иванов' };
    expect(capHttpPageSize(query)).toBe(query);
  });

  it('без размера страницы запрос не меняется', () => {
    const query = { search: 'иванов' };
    expect(capHttpPageSize(query)).toBe(query);
  });

  it('прочие поля отбора сохраняются при обрезке', () => {
    const capped = capHttpPageSize({ pageSize: 100_000, documentType: 'certificate', page: 3 });
    expect(capped.documentType).toBe('certificate');
    expect(capped.page).toBe(3);
  });
});
