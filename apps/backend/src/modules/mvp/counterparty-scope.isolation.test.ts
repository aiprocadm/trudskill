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
  const service = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    {
      listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
    } as unknown as DocumentsService,
    { createUploadIntent: vi.fn() } as unknown as FilesService,
    new EventEmitter2()
  );

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
});
