import { describe, expect, it } from 'vitest';

import { InMemoryLearnersRepository } from './in-memory-learners.repository.js';
import { parseLearnersListQuery } from './learners-registry.js';
import { LEARNER_SORT_COLUMNS } from './postgres-learners.repository.js';

import type { Learner } from '../../mvp.types.js';

const T = 'tenant_demo';
const base = {
  tenantId: T,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};
const rows: Learner[] = [
  {
    ...base,
    id: 'l1',
    firstName: 'Иван',
    lastName: 'Иванов',
    email: 'a@x.ru',
    counterpartyId: 'c1',
    linkedIamUserId: 'u1'
  },
  { ...base, id: 'l2', firstName: 'Анна', lastName: 'Петрова', counterpartyId: 'c2' },
  {
    ...base,
    id: 'l3',
    firstName: 'Пётр',
    lastName: 'Сидоров',
    email: 'c@x.ru',
    linkedIamUserId: 'u3'
  },
  { ...base, id: 'other', tenantId: 'tenant_other', firstName: 'Чужой', lastName: 'Слушатель' }
];

const repo = () =>
  new InMemoryLearnersRepository(rows, new Map(), {
    groupsByLearner: new Map([
      [
        'l1',
        [
          {
            groupId: 'g1',
            groupName: 'ОТ-14',
            groupStatus: 'in_progress',
            status: 'active',
            enrolledAt: '2026-03-01'
          }
        ]
      ],
      [
        'l3',
        [
          {
            groupId: 'g1',
            groupName: 'ОТ-14',
            groupStatus: 'in_progress',
            status: 'cancelled',
            enrolledAt: '2026-02-01'
          }
        ]
      ]
    ]),
    companyNames: new Map([['c1', 'ООО «Ромб»']]),
    lastLogins: new Map([['u1', '2026-09-20T10:00:00.000Z']]),
    consents: new Map([['l1', true]])
  });

const query = (extra: Record<string, string>) =>
  parseLearnersListQuery({ page: 1, page_size: 50, ...extra }, LEARNER_SORT_COLUMNS);

/** Фильтры и сведения реестра слушателей (МГ-C3.2, срез 11.1, РМ103–РМ104) — зеркало SQL. */
describe('InMemoryLearnersRepository — реестр', () => {
  it('фильтры: компания, группа (только незавершённые зачисления), без почты, не входил', async () => {
    const r = repo();
    expect((await r.list(T, query({ client_id: 'c1' }))).items.map((i) => i.id)).toEqual(['l1']);
    expect((await r.list(T, query({ group_id: 'g1' }))).items.map((i) => i.id)).toEqual(['l1']);
    expect((await r.list(T, query({ no_email: '1' }))).items.map((i) => i.id)).toEqual(['l2']);
    expect(
      (await r.list(T, query({ never_logged_in: 'true' }))).items.map((i) => i.id).sort()
    ).toEqual(['l2', 'l3']);
    expect((await r.list(T, query({}))).total).toBe(3);
  });

  it('сведения: компания, текущая группа, последний вход, согласие; чужой центр — пусто', async () => {
    const r = repo();
    const details = await r.registryDetails(T, ['l1', 'l2', 'l3', 'other']);
    expect(details.get('l1')).toEqual({
      companyName: 'ООО «Ромб»',
      currentGroupId: 'g1',
      currentGroupName: 'ОТ-14',
      currentGroupStatus: 'in_progress',
      lastLoginAt: '2026-09-20T10:00:00.000Z',
      consentGranted: true
    });
    expect(details.get('l2')).toEqual({ consentGranted: false });
    expect(details.get('l3')).toEqual({ consentGranted: false });
    expect(details.has('other')).toBe(false);
  });

  it('разбор параметров: флаги из строки запроса, компания и группа — как есть', () => {
    expect(
      query({ client_id: ' c1 ', group_id: 'g1', no_email: 'да', never_logged_in: '0' })
    ).toMatchObject({
      companyId: 'c1',
      groupId: 'g1',
      noEmail: true
    });
    expect(query({ never_logged_in: '0' }).neverLoggedIn).toBeUndefined();
  });
});
