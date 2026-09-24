import { describe, expect, it } from 'vitest';

import { CounterpartyPeopleService } from './counterparty-people.service.js';
import { InMemoryCounterpartyPeopleRepository } from './in-memory-counterparty-people.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { Counterparty, Learner } from '../mvp.types.js';

const T = 'tenant_demo';
const NOW = '2026-09-24T10:00:00.000Z';

const counterparty = (id: string, name: string): Counterparty => ({
  id,
  tenantId: T,
  code: id.toUpperCase(),
  name,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW
});

const learner = (id: string, counterpartyId?: string): Learner =>
  ({
    id,
    tenantId: T,
    fullName: 'Иванов Иван',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    ...(counterpartyId ? { counterpartyId } : {})
  }) as Learner;

const ctx = (extra: Partial<RequestContext> = {}): RequestContext => ({
  requestId: 'req',
  correlationId: 'corr',
  tenantId: T,
  userId: 'u_curator',
  ...extra
});

function makeService() {
  const state = new InMemoryMvpState();
  state.counterparties.push(counterparty('cp_a', 'Ромашка'), counterparty('cp_b', 'Лютик'));
  state.learners.push(learner('l_free'), learner('l_other', 'cp_b'));
  const repo = new InMemoryCounterpartyPeopleRepository();
  const audit = new AuditService();
  return { state, repo, audit, service: new CounterpartyPeopleService(state, repo, audit) };
}

describe('люди компании (МГ-D2.1, срез 14.1)', () => {
  it('контакты: основной у компании один, в архиве основным не остаётся', async () => {
    const { service, audit } = makeService();
    const first = await service.createContact(
      T,
      'cp_a',
      { firstName: 'Анна', lastName: 'Петрова', email: 'hr@romashka.ru', isPrimary: true },
      ctx()
    );
    const second = await service.createContact(
      T,
      'cp_a',
      { firstName: 'Олег', isPrimary: true },
      ctx()
    );
    const listed = (await service.listContacts(T, 'cp_a', ctx())).items;
    expect(listed.map((c) => [c.id, c.isPrimary])).toEqual([
      [second.id, true],
      [first.id, false]
    ]);

    const archived = await service.updateContact(
      T,
      'cp_a',
      second.id,
      { status: 'archived' },
      ctx()
    );
    expect(archived).toMatchObject({ status: 'archived', isPrimary: false });
    const actions = (await audit.list(T)).map((e) => e.action);
    expect(actions).toContain('crm.counterparty_contact_created');
    expect(actions).toContain('crm.counterparty_contact_updated');
  });

  it('представитель чужой компании её людей не видит и не пишет — «не найдено»', async () => {
    const { service } = makeService();
    const rep = ctx({ counterpartyId: 'cp_b' });
    await expect(service.listContacts(T, 'cp_a', rep)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.createEmployee(T, 'cp_a', { lastName: 'Сидоров', firstName: 'Пётр' }, rep)
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.listEmployees(T, 'cp_b', {}, rep)).resolves.toMatchObject({ total: 0 });
  });

  it('вставка списком — частичный успех: кривые строки и дубли названы поимённо, остальные заведены', async () => {
    const { service, audit } = makeService();
    await service.createEmployee(
      T,
      'cp_a',
      { lastName: 'Сидоров', firstName: 'Пётр', employeeNo: '17' },
      ctx()
    );
    const outcome = await service.bulkEmployees(
      T,
      'cp_a',
      {
        rows: [
          { lastName: 'Иванова', firstName: 'Мария', position: 'Бухгалтер' },
          { lastName: 'Кузнецов' },
          { lastName: 'Орлов', firstName: 'Игорь', email: 'не-почта' },
          { lastName: 'СИДОРОВ', firstName: 'пётр' },
          { lastName: 'Иванова', firstName: 'Мария' },
          { lastName: 'Белов', firstName: 'Олег', employeeNo: '17' },
          { lastName: 'Фёдоров', firstName: 'Семён' },
          { lastName: 'Смирнов', firstName: 'Алексей' }
        ]
      },
      ctx()
    );
    expect(outcome).toMatchObject({ total: 8, created: 3, skipped: 3, failed: 2 });
    expect(outcome.rows.filter((r) => r.status !== 'created')).toEqual([
      { rowNumber: 2, status: 'failed', fullName: 'Кузнецов', reason: 'Нужны фамилия и имя.' },
      {
        rowNumber: 3,
        status: 'failed',
        fullName: 'Орлов Игорь',
        reason: 'Почта «не-почта» не похожа на адрес.'
      },
      {
        rowNumber: 4,
        status: 'skipped',
        fullName: 'СИДОРОВ пётр',
        reason: 'Уже есть среди сотрудников компании.'
      },
      {
        rowNumber: 5,
        status: 'skipped',
        fullName: 'Иванова Мария',
        reason: 'Уже есть среди сотрудников компании.'
      },
      {
        rowNumber: 6,
        status: 'skipped',
        fullName: 'Белов Олег',
        reason: 'Табельный номер 17 уже занят.'
      }
    ]);
    const page = await service.listEmployees(T, 'cp_a', { q: 'ива' }, ctx());
    expect(page.items.map((e) => e.lastName)).toEqual(['Иванова']);
    expect((await service.listEmployees(T, 'cp_a', {}, ctx())).total).toBe(4);
    expect((await audit.list(T)).map((e) => e.action)).toContain(
      'crm.counterparty_employees_bulk_added'
    );
  });

  it('табельный номер занят — понятный отказ; без номера сотрудников может быть сколько угодно', async () => {
    const { service } = makeService();
    await service.createEmployee(
      T,
      'cp_a',
      { lastName: 'А', firstName: 'Б', employeeNo: '5' },
      ctx()
    );
    await expect(
      service.createEmployee(T, 'cp_a', { lastName: 'В', firstName: 'Г', employeeNo: '5' }, ctx())
    ).rejects.toMatchObject({ status: 409, response: { code: 'employee_no_taken' } });
    await service.createEmployee(T, 'cp_a', { lastName: 'Д', firstName: 'Е' }, ctx());
    await service.createEmployee(T, 'cp_a', { lastName: 'Ж', firstName: 'З' }, ctx());
    expect((await service.listEmployees(T, 'cp_a', {}, ctx())).total).toBe(3);
  });

  it('связь со слушателем: пишется в обе стороны, чужая компания и повтор — отказ, снятие — отвязывает', async () => {
    const { service, state } = makeService();
    const worker = await service.createEmployee(
      T,
      'cp_a',
      { lastName: 'Иванов', firstName: 'Иван' },
      ctx()
    );
    await expect(
      service.updateEmployee(T, 'cp_a', worker.id, { learnerId: 'l_other' }, ctx())
    ).rejects.toMatchObject({ response: { code: 'employee_learner_other_company' } });

    const linked = await service.updateEmployee(
      T,
      'cp_a',
      worker.id,
      { learnerId: 'l_free' },
      ctx()
    );
    expect(linked.learnerId).toBe('l_free');
    const free = state.learners.find((l) => l.id === 'l_free')!;
    expect(free).toMatchObject({ counterpartyEmployeeId: worker.id, counterpartyId: 'cp_a' });

    const twin = await service.createEmployee(
      T,
      'cp_a',
      { lastName: 'Двойник', firstName: 'И' },
      ctx()
    );
    await expect(
      service.updateEmployee(T, 'cp_a', twin.id, { learnerId: 'l_free' }, ctx())
    ).rejects.toMatchObject({ status: 409, response: { code: 'learner_already_linked' } });

    const unlinked = await service.updateEmployee(T, 'cp_a', worker.id, { learnerId: null }, ctx());
    expect(unlinked.learnerId).toBeUndefined();
    expect(free.counterpartyEmployeeId).toBeUndefined();
    expect(free.counterpartyId).toBe('cp_a');
  });
});
