import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DocumentsNormalizedReadsService } from './documents-normalized-reads.service.js';
import { InMemoryGeneratedDocumentsRepository } from './repositories/in-memory-generated-documents.repository.js';

import type { GeneratedDocumentEntity } from '../documents.types.js';

/**
 * Сервис чтения документов из таблицы (Фаза 1, срез 5b) повторяет правила снимка: та же форма
 * страницы `{ items, page, pageSize, total }`, размер по умолчанию 20, один 404 для чужого
 * центра и несуществующего документа, книга выдачи по дате документа по убыванию.
 */
const T = 't1';

const doc = (
  id: string,
  extra: Partial<GeneratedDocumentEntity> & { tenantId?: string } = {}
): GeneratedDocumentEntity =>
  ({
    id,
    tenantId: T,
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: `Удостоверение ${id}`,
    sourceEntityType: 'enrollment',
    sourceEntityId: 'e1',
    fileId: 'f1',
    status: 'final',
    isFinal: true,
    documentNumber: `АБ-${id}`,
    documentDate: '2026-09-10',
    generatedAt: `2026-09-10T10:00:0${id.length}.000Z`,
    variablesSnapshot: { passport: '4500 123456' },
    ...extra
  }) as GeneratedDocumentEntity;

const rows = [
  doc('d1'),
  doc('d2', {
    documentType: 'protocol',
    name: 'Протокол',
    documentDate: '2026-09-12',
    sourceEntityId: 'g1',
    sourceEntityType: 'group'
  }),
  doc('d3', { status: 'revoked', documentDate: '2026-09-11', groupOrderDocumentId: 'ord1' }),
  doc('d9', { tenantId: 't2' })
];

const makeService = () =>
  new DocumentsNormalizedReadsService(new InMemoryGeneratedDocumentsRepository(rows));

describe('DocumentsNormalizedReadsService', () => {
  it('список: изоляция центра, размер страницы по умолчанию 20, фильтры как в снимке', async () => {
    const service = makeService();
    const all = await service.listDocuments(T, {});
    expect(all.items.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
    expect([all.page, all.pageSize, all.total]).toEqual([1, 20, 3]);
    expect(
      (await service.listDocuments(T, { documentType: 'protocol' })).items.map((d) => d.id)
    ).toEqual(['d2']);
    expect(
      (await service.listDocuments(T, { sourceEntityType: 'enrollment', sourceEntityId: 'e1' }))
        .total
    ).toBe(2);
    expect(
      (await service.listDocuments(T, { page: '2', pageSize: '2' } as never)).items.map((d) => d.id)
    ).toEqual(['d3']);
  });

  it('поиск — по названию, номеру и типу, но не по ПДн из бланка (РМ43, журнал 622)', async () => {
    const service = makeService();
    expect((await service.listDocuments(T, { search: 'протокол' })).items.map((d) => d.id)).toEqual(
      ['d2']
    );
    expect((await service.listDocuments(T, { search: 'АБ-d3' })).items.map((d) => d.id)).toEqual([
      'd3'
    ]);
    expect((await service.listDocuments(T, { search: '4500 123456' })).total).toBe(0);
  });

  it('карточка: чужой центр и несуществующий документ — одинаковый 404', async () => {
    const service = makeService();
    expect((await service.getDocument(T, 'd1')).name).toBe('Удостоверение d1');
    await expect(service.getDocument(T, 'd9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getDocument(T, 'd_missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('книга выдачи: дата по убыванию, период, типы, статус, приказ, страница', async () => {
    const service = makeService();
    const all = await service.listIssuedDocuments(T, {});
    expect(all.items.map((d) => d.id)).toEqual(['d2', 'd3', 'd1']);
    expect(all.total).toBe(3);
    expect(
      (await service.listIssuedDocuments(T, { from: '2026-09-11', to: '2026-09-11' })).items.map(
        (d) => d.id
      )
    ).toEqual(['d3']);
    expect((await service.listIssuedDocuments(T, { types: ['protocol'] })).total).toBe(1);
    expect(
      (await service.listIssuedDocuments(T, { status: 'revoked' })).items.map((d) => d.id)
    ).toEqual(['d3']);
    expect((await service.listIssuedDocuments(T, { groupOrderDocumentId: 'ord1' })).total).toBe(1);
    const page = await service.listIssuedDocuments(T, { limit: 1, offset: 1 });
    expect(page.items.map((d) => d.id)).toEqual(['d3']);
    expect(page.total).toBe(3);
  });
});
