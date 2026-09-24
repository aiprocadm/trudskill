import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { LearnerHistoryService } from './learner-history.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { Enrollment, Learner } from '../mvp.types.js';

const T = 'tenant_demo';

function makeService() {
  const state = new InMemoryMvpState();
  const learner: Learner = {
    id: 'l_1',
    tenantId: T,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    firstName: 'Иван',
    lastName: 'Иванов'
  };
  state.learners.push(learner, { ...learner, id: 'l_other', tenantId: 'tenant_other' });
  state.enrollments.push({
    id: 'e_1',
    tenantId: T,
    status: 'active',
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    groupId: 'g_1',
    learnerId: 'l_1',
    enrolledAt: '2026-04-02'
  } as Enrollment);
  const audit = new AuditService();
  const write = (action: string, entityType: string, entityId: string, actorId?: string) =>
    audit.write({
      tenantId: T,
      action,
      entityType,
      entityId,
      ...(actorId ? { actorId, actorName: 'Куратор Петрова' } : {})
    });
  return { service: new LearnerHistoryService(state, audit), write, audit };
}

/** История слушателя для вкладки карточки (МГ-C2.1, срез 9.1, РМ91). */
describe('LearnerHistoryService', () => {
  it('собирает события по слушателю и его зачислениям без значений полей; система — без актора', async () => {
    const { service, write } = makeService();
    write('learning.learner_created', 'learning.learner', 'l_1', 'u_1');
    write('learner.personal_data_accessed', 'mvp.learner', 'l_1', 'u_1');
    write('learning.enrollment_status_changed', 'learning.enrollment', 'e_1');
    write('learning.learner_updated', 'learning.learner', 'l_other', 'u_1');
    write('learning.enrollment_status_changed', 'learning.enrollment', 'e_other', 'u_1');

    const history = await service.compose(T, 'l_1');
    expect(history.truncated).toBe(false);
    expect(history.items.map((item) => item.action).sort()).toEqual([
      'learner.personal_data_accessed',
      'learning.enrollment_status_changed',
      'learning.learner_created'
    ]);
    const enrollmentEvent = history.items.find((item) => item.entityType === 'learning.enrollment');
    expect(enrollmentEvent?.system).toBe(true);
    const created = history.items.find((item) => item.action === 'learning.learner_created');
    expect(created?.actorName).toBe('Куратор Петрова');
    expect(created?.system).toBe(false);
    // Ни одной строки со значениями полей — в них бывают ПДн.
    for (const item of history.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'action',
          'createdAt',
          'entityType',
          'id',
          'system',
          ...(item.actorName ? ['actorName'] : [])
        ].sort()
      );
    }
  });

  it('чужой слушатель — 404, а не пустая история', async () => {
    const { service } = makeService();
    await expect(service.compose(T, 'l_other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.compose(T, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('событие другого центра не подмешивается даже при совпадении идентификатора', async () => {
    const { service, audit } = makeService();
    audit.write({
      tenantId: 'tenant_other',
      action: 'learning.learner_updated',
      entityType: 'learning.learner',
      entityId: 'l_1'
    });
    const history = await service.compose(T, 'l_1');
    expect(history.items).toEqual([]);
  });
});
