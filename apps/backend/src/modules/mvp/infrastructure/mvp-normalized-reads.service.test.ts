import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { MvpNormalizedReadsService } from './mvp-normalized-reads.service.js';
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
    status: 'active'
  },
  { id: 'l2', tenantId: T, ...AT, firstName: 'Пётр', lastName: 'Петров', status: 'inactive' },
  { id: 'l9', tenantId: 't2', ...AT, firstName: 'Чужой', lastName: 'Чужой', status: 'active' }
].map((l) => encryptLearnerPiiAtRest(l) as never);

const makeService = () =>
  new MvpNormalizedReadsService(
    new InMemoryRegistryRepository(counterparties, 'id'),
    new InMemoryRegistryRepository(groups, 'counterpartyId'),
    new InMemoryLearnersRepository(learners)
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
});
