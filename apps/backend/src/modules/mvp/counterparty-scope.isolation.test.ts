import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { FilesService } from '../../modules/files/files.service.js';
import type { DocumentsService } from '../documents/documents.service.js';

/**
 * Изоляция ПО КОНТРАГЕНТУ внутри тенанта (ФТ-E5, Фаза 4 Task 1).
 *
 * Два существующих isolation-теста проверяют изоляцию ТЕНАНТОВ. Этот — третий уровень:
 * представитель заказчика не видит других заказчиков ТОГО ЖЕ учебного центра. Портал
 * заказчика изначально сделан как обзор для персонала, и без этого скоупа заведение
 * роли представителя включило бы утечку клиентской базы в тот же день.
 */

const T = 'tenant_demo';
const ctx = { tenantId: T, requestId: 'r1', correlationId: 'c1', userId: 'u_admin' } as never;

const STAFF = {};

function harness() {
  const state = new InMemoryMvpState();
  // Заглушка повторяет реальную пагинацию listDocuments (по умолчанию 20 строк):
  // скоуп обязан фильтровать ДО пагинации, и заглушка без пагинации не поймала бы регресс.
  const generatedDocs: Array<{
    id: string;
    tenantId: string;
    documentType: string;
    name: string;
    sourceEntityType: string;
    sourceEntityId: string;
    status: string;
    generatedAt: string;
  }> = [];
  const service = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    {
      listDocuments: (tenantId: string, q: { page?: number; pageSize?: number }) => {
        const rows = generatedDocs.filter((d) => d.tenantId === tenantId);
        const page = q.page ?? 1;
        const pageSize = q.pageSize ?? 20;
        return {
          items: rows.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: rows.length
        };
      },
      // Как настоящий getDocument: несуществующий id -> NotFoundException (см. must()).
      getDocument: (tenantId: string, id: string) => {
        const row = generatedDocs.find((d) => d.tenantId === tenantId && d.id === id);
        if (!row) throw new NotFoundException(`Entity ${id} not found`);
        return row;
      }
    } as unknown as DocumentsService,
    { createUploadIntent: vi.fn() } as unknown as FilesService,
    new EventEmitter2()
  );

  let docSeq = 0;
  const addDoc = (enrollmentId: string) => {
    docSeq += 1;
    const doc = {
      id: `doc_${docSeq}`,
      tenantId: T,
      documentType: 'certificate',
      name: `Удостоверение ${docSeq}`,
      sourceEntityType: 'enrollment',
      sourceEntityId: enrollmentId,
      status: 'issued',
      generatedAt: '2026-07-31T00:00:00.000Z',
      fileId: `file_${docSeq}`
    };
    generatedDocs.push(doc);
    return doc;
  };

  const cpA = service.createCounterparty(T, 'u_admin', { code: 'A', name: 'Завод А' }, ctx);
  const cpB = service.createCounterparty(T, 'u_admin', { code: 'B', name: 'Завод Б' }, ctx);
  // Идентификаторы генерируются — привязки представителей строим по фактическим.
  const repA = { counterpartyId: cpA.id };
  const repB = { counterpartyId: cpB.id };

  const groupA = service.createGroup(T, 'u_admin', { code: 'GA', name: 'Группа А' }, ctx);
  const groupB = service.createGroup(T, 'u_admin', { code: 'GB', name: 'Группа Б' }, ctx);
  const groupInternal = service.createGroup(T, 'u_admin', { code: 'GI', name: 'Внутренняя' }, ctx);
  // Привязка групп к заказчикам.
  state.groups.find((g) => g.id === groupA.id)!.counterpartyId = cpA.id;
  state.groups.find((g) => g.id === groupB.id)!.counterpartyId = cpB.id;

  const learnerA = service.createLearner(T, 'u_admin', { code: 'LA', name: 'Иванов Иван' }, ctx);
  const learnerB = service.createLearner(T, 'u_admin', { code: 'LB', name: 'Петров Пётр' }, ctx);
  const enrA = service.createEnrollment(
    T,
    'u_admin',
    { groupId: groupA.id, learnerId: learnerA.id },
    ctx
  );
  const enrB = service.createEnrollment(
    T,
    'u_admin',
    { groupId: groupB.id, learnerId: learnerB.id },
    ctx
  );

  return {
    service,
    state,
    addDoc,
    cpA,
    cpB,
    repA,
    repB,
    groupA,
    groupB,
    groupInternal,
    learnerA,
    learnerB,
    enrA,
    enrB
  };
}

describe('изоляция по контрагенту (ФТ-E5)', () => {
  it('представитель видит в справочнике ТОЛЬКО свою компанию', () => {
    const h = harness();
    const list = h.service.listCounterparties(T, {}, h.repA);
    expect(list.items.map((c) => c.id)).toEqual([h.cpA.id]);
  });

  it('чужая компания по прямому идентификатору — «не найдено», а не «запрещено»', () => {
    const h = harness();
    expect(() => h.service.getCounterparty(T, h.cpB.id, h.repA)).toThrow(NotFoundException);
  });

  it('группы: только свои; внутренняя группа центра НЕ видна', () => {
    const h = harness();
    const list = h.service.listGroups(T, {}, h.repA);
    expect(list.items.map((g) => g.id)).toEqual([h.groupA.id]);
  });

  it('зачисления: только в группы своего заказчика', () => {
    const h = harness();
    const list = h.service.listEnrollments(T, {}, { actor: h.repA });
    expect(list.items.map((e) => e.id)).toEqual([h.enrA.id]);
  });

  it('слушатели: только сотрудники своего заказчика', () => {
    const h = harness();
    const list = h.service.listLearners(T, {}, h.repA);
    expect(list.items.map((l) => l.id)).toEqual([h.learnerA.id]);
  });

  it('представители разных заказчиков не пересекаются', () => {
    const h = harness();
    const a = h.service.listLearners(T, {}, h.repA).items.map((l) => l.id);
    const b = h.service.listLearners(T, {}, h.repB).items.map((l) => l.id);
    expect(a).toEqual([h.learnerA.id]);
    expect(b).toEqual([h.learnerB.id]);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it('total не раскрывает размер клиентской базы центра', () => {
    // Фильтрация идёт ДО пагинации: total представителя — про его данные, а не про центр.
    const h = harness();
    expect(h.service.listGroups(T, {}, h.repA).total).toBe(1);
    expect(h.service.listCounterparties(T, {}, h.repA).total).toBe(1);
  });

  it('персонал центра по-прежнему видит всё', () => {
    const h = harness();
    expect(h.service.listCounterparties(T, {}, STAFF).total).toBe(2);
    expect(h.service.listGroups(T, {}, STAFF).total).toBe(3);
    expect(() => h.service.getCounterparty(T, h.cpB.id, STAFF)).not.toThrow();
  });

  it('вызовы БЕЗ актора (существующие места) не ограничены — обратная совместимость', () => {
    const h = harness();
    expect(h.service.listGroups(T, {}).total).toBe(3);
  });

  it('документы портала: только документы сотрудников своего заказчика', () => {
    const h = harness();
    const docA = h.addDoc(h.enrA.id);
    h.addDoc(h.enrB.id);
    const list = h.service.listPortalDocuments(T, {}, h.repA);
    expect(list.items.map((d) => d.id)).toEqual([docA.id]);
    expect(list.items[0]!.learnerId).toBe(h.learnerA.id);
  });

  it('документы портала: представители разных заказчиков не пересекаются', () => {
    const h = harness();
    h.addDoc(h.enrA.id);
    h.addDoc(h.enrB.id);
    const a = h.service.listPortalDocuments(T, {}, h.repA).items.map((d) => d.id);
    const b = h.service.listPortalDocuments(T, {}, h.repB).items.map((d) => d.id);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('документы портала: скоуп применяется ДО пагинации хранилища документов', () => {
    // 25 чужих документов заполняют первую «страницу по умолчанию» (20 строк) хранилища.
    // Если бы скоуп фильтровал уже отрезанную страницу, документ представителя А пропал бы.
    const h = harness();
    for (let i = 0; i < 25; i += 1) h.addDoc(h.enrB.id);
    const docA = h.addDoc(h.enrA.id);
    const list = h.service.listPortalDocuments(T, {}, h.repA);
    expect(list.items.map((d) => d.id)).toEqual([docA.id]);
    expect(list.total).toBe(1);
  });

  it('документы портала: персонал без привязки видит документы всех зачислений', () => {
    const h = harness();
    h.addDoc(h.enrA.id);
    h.addDoc(h.enrB.id);
    expect(h.service.listPortalDocuments(T, {}, STAFF).total).toBe(2);
  });
});

describe('скачивание документа портала (ФТ-E5, Фаза 5 Task 6)', () => {
  it('представитель получает ссылку на документ СВОЕГО сотрудника', () => {
    const h = harness();
    const docA = h.addDoc(h.enrA.id);
    const result = h.service.getPortalDocumentDownload(T, docA.id, h.repA);
    expect(result.downloadUrl).toContain(`/files/${docA.fileId}/download`);
  });

  it('анти-IDOR: документ сотрудника ЧУЖОГО заказчика — «не найдено», а не «запрещено»', () => {
    const h = harness();
    const docB = h.addDoc(h.enrB.id);
    expect(() => h.service.getPortalDocumentDownload(T, docB.id, h.repA)).toThrow(
      NotFoundException
    );
  });

  it('несуществующий документ — тоже 404: ответы про чужое и про несуществующее неразличимы', () => {
    const h = harness();
    expect(() => h.service.getPortalDocumentDownload(T, 'doc_ghost', h.repA)).toThrow(
      NotFoundException
    );
  });

  it('документ, выпущенный НЕ по зачислению, представителю не отдаётся', () => {
    const h = harness();
    const doc = h.addDoc(h.enrA.id);
    (doc as { sourceEntityType: string }).sourceEntityType = 'group';
    expect(() => h.service.getPortalDocumentDownload(T, doc.id, h.repA)).toThrow(NotFoundException);
  });

  it('документ без файла — 404 и для владельца: скачивать нечего', () => {
    const h = harness();
    const doc = h.addDoc(h.enrA.id);
    (doc as { fileId: string }).fileId = '';
    expect(() => h.service.getPortalDocumentDownload(T, doc.id, h.repA)).toThrow(NotFoundException);
  });

  it('персонал центра (без привязки) скачивает любой документ — как раньше', () => {
    const h = harness();
    const docB = h.addDoc(h.enrB.id);
    const result = h.service.getPortalDocumentDownload(T, docB.id, STAFF);
    expect(result.downloadUrl).toContain(`/files/${docB.fileId}/download`);
  });
});
