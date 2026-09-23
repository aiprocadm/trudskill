import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { MvpNormalizedReadsService } from './mvp-normalized-reads.service.js';
import { InMemoryEnrollmentsRepository } from './repositories/in-memory-enrollments.repository.js';
import { InMemoryLearnersRepository } from './repositories/in-memory-learners.repository.js';
import { InMemoryRegistryRepository } from './repositories/in-memory-registry.repository.js';
import { encryptLearnerPiiAtRest } from '../../../infrastructure/crypto/pii-crypto.js';

/**
 * Сервис чтения из нормализованных таблиц (Фаза 1, срез 1b) повторяет правила снимка:
 * скоуп представителя заказчика, 404 с одним кодом для чужой и несуществующей записи,
 * та же форма страницы `{ items, page, pageSize, total }`.
 */
const T = 't1';
const AT = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

const counterparties = [
  { id: 'cp1', tenantId: T, ...AT, code: 'CP-1', name: 'Ромашка', status: 'active' },
  { id: 'cp2', tenantId: T, ...AT, code: 'CP-2', name: 'Лютик', status: 'active' },
  { id: 'cp9', tenantId: 't2', ...AT, code: 'CP-9', name: 'Чужая', status: 'active' }
];
const groups = [
  {
    id: 'g1',
    tenantId: T,
    ...AT,
    code: 'G-1',
    name: 'Первая',
    status: 'active',
    counterpartyId: 'cp1'
  },
  {
    id: 'g2',
    tenantId: T,
    ...AT,
    code: 'G-2',
    name: 'Вторая',
    status: 'closed',
    counterpartyId: 'cp2'
  },
  { id: 'g3', tenantId: T, ...AT, code: 'G-3', name: 'Внутренняя', status: 'active' }
];

/** Как строки лежат в таблице: ПДн шифртекстом и со слепым индексом (как после проекции). */
const learners = [
  {
    id: 'l1',
    tenantId: T,
    ...AT,
    firstName: 'Иван',
    lastName: 'Иванов',
    learnerNo: 'Т-001',
    snils: '112-233-445 95',
    email: 'ivan@example.com',
    status: 'active',
    linkedIamUserId: 'u_ivan'
  },
  { id: 'l2', tenantId: T, ...AT, firstName: 'Пётр', lastName: 'Петров', status: 'inactive' },
  { id: 'l9', tenantId: 't2', ...AT, firstName: 'Чужой', lastName: 'Чужой', status: 'active' }
].map((l) => encryptLearnerPiiAtRest(l) as never);

const enrollments = [
  {
    id: 'e1',
    tenantId: T,
    ...AT,
    groupId: 'g1',
    learnerId: 'l1',
    status: 'active',
    enrolledAt: AT.createdAt
  },
  {
    id: 'e2',
    tenantId: T,
    ...AT,
    groupId: 'g2',
    learnerId: 'l2',
    status: 'completed',
    enrolledAt: AT.createdAt
  },
  {
    id: 'e3',
    tenantId: T,
    ...AT,
    groupId: 'g3',
    learnerId: 'l1',
    status: 'cancelled',
    enrolledAt: AT.createdAt
  }
] as never[];
const history = [
  {
    id: 'h1',
    tenantId: T,
    enrollmentId: 'e1',
    status: 'pending',
    changedAt: '2026-08-01T00:00:00.000Z'
  },
  {
    id: 'h2',
    tenantId: T,
    enrollmentId: 'e1',
    status: 'active',
    changedAt: '2026-08-02T00:00:00.000Z'
  }
] as never[];

const makeService = () =>
  new MvpNormalizedReadsService(
    new InMemoryRegistryRepository(counterparties, 'id'),
    new InMemoryRegistryRepository(groups, 'counterpartyId'),
    new InMemoryLearnersRepository(
      learners,
      new Map([
        ['l1', ['cp1']],
        ['l2', ['cp2']]
      ])
    ),
    new InMemoryEnrollmentsRepository(
      enrollments,
      history,
      new Map([
        ['g1', 'cp1'],
        ['g2', 'cp2'],
        ['g3', undefined]
      ])
    )
  );

describe('MvpNormalizedReadsService', () => {
  it('персонал центра видит всех контрагентов и все группы своего центра', async () => {
    const service = makeService();
    const cps = await service.listCounterparties(T, {});
    expect(cps.items.map((c) => c.id)).toEqual(['cp1', 'cp2']);
    expect(cps).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    const grs = await service.listGroups(T, { status: 'active' });
    expect(grs.items.map((g) => g.id)).toEqual(['g1', 'g3']);
  });

  it('представитель заказчика видит только своего контрагента и его группы; группа без контрагента не видна', async () => {
    const service = makeService();
    const actor = { counterpartyId: 'cp1' };
    expect((await service.listCounterparties(T, {}, actor)).items.map((c) => c.id)).toEqual([
      'cp1'
    ]);
    expect((await service.listGroups(T, {}, actor)).items.map((g) => g.id)).toEqual(['g1']);
    await expect(service.getCounterparty(T, 'cp2', actor)).rejects.toMatchObject({
      response: { code: 'not_found' }
    });
    expect((await service.getCounterparty(T, 'cp1', actor)).name).toBe('Ромашка');
  });

  it('чужой центр и несуществующая запись — одинаковый 404', async () => {
    const service = makeService();
    await expect(service.getGroup(T, 'g_missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getCounterparty(T, 'cp9')).rejects.toMatchObject({
      response: { code: 'not_found', message: 'Entity not found' }
    });
  });

  it('lookup отдаёт id, подпись и статус, скоуп не применяет (как снимок)', async () => {
    const service = makeService();
    const lookup = await service.lookupGroups(T, { q: 'втор' });
    expect(lookup.items).toEqual([{ id: 'g2', label: 'Вторая', status: 'closed' }]);
  });

  it('сортировка по белому списку с направлением, страница по размеру', async () => {
    const service = makeService();
    const page = await service.listGroups(T, { sort: 'name:desc', page: 1, page_size: 2 });
    expect(page.items.map((g) => g.name)).toEqual(['Первая', 'Вторая']);
    expect(page.total).toBe(3);
  });

  it('слушатели (срез 2b): ПДн расшифрованы, слепого индекса в ответе нет, чужой центр — 404', async () => {
    const service = makeService();
    const page = await service.listLearners(T, {});
    expect(page.items.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(page.items[0]).toMatchObject({ snils: '112-233-445 95', email: 'ivan@example.com' });
    expect('snilsHash' in page.items[0]!).toBe(false);
    expect((await service.getLearner(T, 'l1')).snils).toBe('112-233-445 95');
    await expect(service.getLearner(T, 'l9')).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.lookupLearners(T, { q: 'петр' })).items).toEqual([
      { id: 'l2', label: 'Пётр Петров', status: 'inactive' }
    ]);
    expect((await service.findLearnersBySnils(T, '11223344595')).map((l) => l.id)).toEqual(['l1']);
  });

  it('слушатели: представитель заказчика видит только зачисленных в группы своего контрагента (срез 3c, снимает РМ37)', async () => {
    const service = makeService();
    const page = await service.listLearners(T, {}, { counterpartyId: 'cp1' });
    expect(page.items.map((l) => l.id)).toEqual(['l1']);
    expect(page.total).toBe(1);
    expect((await service.listLearners(T, {}, { counterpartyId: 'cp_none' })).total).toBe(0);
  });

  it('зачисления (срез 3b): персонал с правом обхода видит всё, слушатель — только свои, без привязки — пусто', async () => {
    const service = makeService();
    const staff = {
      actorId: 'u_staff',
      permissions: ['enrollments.read', 'assessment.read.cross_learner']
    };
    expect((await service.listEnrollments(T, {}, staff)).items.map((e) => e.id)).toEqual([
      'e1',
      'e2',
      'e3'
    ]);
    expect(
      (await service.listEnrollments(T, { status: 'completed' }, staff)).items.map((e) => e.id)
    ).toEqual(['e2']);
    expect(
      (await service.listEnrollments(T, { learner_id: 'l1' } as never, staff)).items.map(
        (e) => e.id
      )
    ).toEqual(['e1', 'e3']);
    // Внутренний вызов без актора — без ограничения.
    expect((await service.listEnrollments(T, {})).total).toBe(3);
    // Слушатель Иван (u_ivan) — только свои; чужой пользователь без привязки — пусто (закрыто по умолчанию).
    expect(
      (
        await service.listEnrollments(
          T,
          {},
          { actorId: 'u_ivan', permissions: ['enrollments.read'] }
        )
      ).items.map((e) => e.id)
    ).toEqual(['e1', 'e3']);
    expect(
      (
        await service.listEnrollments(
          T,
          {},
          { actorId: 'u_nobody', permissions: ['enrollments.read'] }
        )
      ).total
    ).toBe(0);
  });

  it('зачисления: представитель заказчика видит только группы своего контрагента; группа без контрагента не видна', async () => {
    const service = makeService();
    const rep = {
      actorId: 'u_rep',
      permissions: ['enrollments.read', 'assessment.read.cross_learner'],
      actor: { counterpartyId: 'cp1' }
    };
    expect((await service.listEnrollments(T, {}, rep)).items.map((e) => e.id)).toEqual(['e1']);
  });

  it('карточка и история зачисления: 404 для чужого центра, 403 — чужой привязанный слушатель, история по порядку', async () => {
    const service = makeService();
    await expect(service.getEnrollment(T, 'e_missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getEnrollment(T, 'e1', { actorId: 'u_other', permissions: ['enrollments.read'] })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (
        await service.getEnrollment(T, 'e1', {
          actorId: 'u_ivan',
          permissions: ['enrollments.read']
        })
      ).id
    ).toBe('e1');
    // Слушатель l2 без привязки — открыт для чтения, как в снимке.
    expect(
      (
        await service.getEnrollment(T, 'e2', {
          actorId: 'u_other',
          permissions: ['enrollments.read']
        })
      ).id
    ).toBe('e2');
    expect((await service.listEnrollmentStatusHistory(T, 'e1')).map((h) => h.status)).toEqual([
      'pending',
      'active'
    ]);
    expect(await service.listEnrollmentStatusHistory(T, 'e_missing')).toEqual([]);
  });
});
