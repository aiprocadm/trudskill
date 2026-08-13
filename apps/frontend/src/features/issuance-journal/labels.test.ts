import { describe, expect, it } from 'vitest';

import {
  ALL_TEMPLATE_TYPES,
  DOCUMENT_STATUS_LABELS,
  FILTERABLE_DOCUMENT_STATUSES,
  TEMPLATE_TYPE_LABELS
} from './types';

/*
 * TXT-006: значением на экране не может быть код. В фильтре книги выдачи выпадающий список
 * показывал `generated` / `final` / `archived` как есть — администратор учебного центра
 * не обязан знать, что «final» это «выдан».
 */
describe('подписи книги выдачи', () => {
  it('у каждого состояния из фильтра есть русская подпись', () => {
    const missing = FILTERABLE_DOCUMENT_STATUSES.filter((s) => !DOCUMENT_STATUS_LABELS[s]);
    expect(missing).toEqual([]);
  });

  it('«аннулирован» подписан тоже — он приходит в данных, хоть и не фильтруется', () => {
    expect(DOCUMENT_STATUS_LABELS.revoked).toBeTruthy();
  });

  it('ни одна подпись не написана латиницей', () => {
    const latin = Object.values(DOCUMENT_STATUS_LABELS).filter((label) => /[A-Za-z]/.test(label));
    expect(latin).toEqual([]);
  });

  it('у каждого вида документа есть русская подпись', () => {
    const missing = ALL_TEMPLATE_TYPES.filter((t) => !TEMPLATE_TYPE_LABELS[t]);
    expect(missing).toEqual([]);
  });
});
