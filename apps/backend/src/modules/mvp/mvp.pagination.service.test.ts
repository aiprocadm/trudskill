import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { BaseFilterQuery } from './mvp.dto.js';
import type { Learner } from './mvp.types.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const T = 'tenant_demo';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const makeService = (learnerCount: number): MvpService => {
  const state = new InMemoryMvpState();
  const now = new Date().toISOString();
  for (let i = 0; i < learnerCount; i++) {
    state.learners.push({
      id: `lrn_pg_${String(i).padStart(4, '0')}`,
      tenantId: T,
      firstName: `Имя${i}`,
      lastName: `Фамилия${i}`,
      status: 'active',
      createdAt: now,
      updatedAt: now
    } as Learner);
  }
  return new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
};

/** Query-параметры на живом сервере приходят СТРОКАМИ — тип интерфейса врёт. */
const rawQuery = (q: Record<string, string>): BaseFilterQuery => q as unknown as BaseFilterQuery;

/*
 * Ревизия 2026-08-27 (порция 24, журнал 277). Два дефекта одного помощника `list()`,
 * обслуживающего десятки списков (слушатели со СНИЛС — тоже):
 *  1) `page_size` не имел верхнего предела — `?page_size=1000000` отдавал всю таблицу
 *     одним ответом;
 *  2) параметры приходят строками, а `from + pageSize` СКЛЕИВАЛ строки вместо сложения:
 *     `0 + "1000000"` = "01000000" → slice до миллиона; даже безобидный
 *     `?page=2&page_size=20` давал slice(20, "2020") — сто страниц вместо одной.
 */
describe('пагинация списков MVP — потолок и числовой разбор (порция 24)', () => {
  it('строковый page_size (пришёл с проволоки) ограничен потолком 200', () => {
    const service = makeService(250);
    expect(service.listLearners(T, rawQuery({ page_size: '1000000' })).items).toHaveLength(200);
  });

  it('числовой page_size (внутренний вызов) потолка не имеет — госвыгрузки собирают по 1000', () => {
    const service = makeService(250);
    // Молчаливая обрезка внутренней страницы до 200 обрезала бы выгрузку в госреестр.
    expect(service.listLearners(T, { page_size: 1000 }).items).toHaveLength(250);
  });

  it('строковые page и page_size считаются числами, а не склеиваются', () => {
    const service = makeService(250);
    const result = service.listLearners(T, rawQuery({ page: '2', page_size: '100' }));
    expect(result.items).toHaveLength(100);
    expect(result.items[0]!.id).toBe('lrn_pg_0100');
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(100);
  });

  it('мусор в параметрах не роняет и не отдаёт всё: страница 1, размер по умолчанию', () => {
    const service = makeService(250);
    for (const q of [
      rawQuery({ page: '-1' }),
      rawQuery({ page: '0' }),
      rawQuery({ page: 'abc' }),
      rawQuery({ page_size: 'abc' }),
      rawQuery({ page_size: '-5' })
    ]) {
      const result = service.listLearners(T, q);
      expect(result.page).toBeGreaterThanOrEqual(1);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.length).toBeLessThanOrEqual(20);
    }
  });

  it('умолчания прежние: страница 1 по 20 строк, total честный', () => {
    const service = makeService(250);
    const result = service.listLearners(T, {});
    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(250);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});
