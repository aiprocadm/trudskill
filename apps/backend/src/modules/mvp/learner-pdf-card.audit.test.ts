import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { InMemoryDocumentsState } from '../documents/in-memory-documents.state.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'admin1',
  ip: '10.0.0.5',
  userAgent: 'vitest'
};

describe('learner-pdf-card audit — personal data access', () => {
  it('emits writeCritical learner.personal_data_accessed when composing card', async () => {
    const mvpState = new InMemoryMvpState();
    const audit = new AuditService();
    const docState = new InMemoryDocumentsState();
    const docService = new DocumentsService(docState, audit, new RealtimeEventsService());
    const service = new LearnerPdfCardService(mvpState, docService, audit);

    mvpState.learners.push({
      id: 'learner_1',
      tenantId: 't1',
      learnerNo: '001',
      firstName: 'Иван',
      lastName: 'Петров',
      middleName: 'Сергеевич',
      snils: '111-111-111 11',
      position: 'инженер',
      email: 'i@p.ru'
    });

    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };

    await service.composeData('t1', 'admin1', 'learner_1', ctx);

    expect(awaited).toBe(true);
    const events = await audit.list('t1');
    const accessed = events.find((e) => e.action === 'learner.personal_data_accessed');
    expect(accessed).toBeDefined();
    expect(accessed).toMatchObject({
      entityType: 'mvp.learner',
      entityId: 'learner_1',
      actorId: 'admin1',
      tenantId: 't1'
    });
    expect(accessed?.ip).toBe('10.0.0.5');
  });

  it('does NOT log personal data values in audit (only entityId)', async () => {
    const mvpState = new InMemoryMvpState();
    const audit = new AuditService();
    const docState = new InMemoryDocumentsState();
    const docService = new DocumentsService(docState, audit, new RealtimeEventsService());
    const service = new LearnerPdfCardService(mvpState, docService, audit);

    mvpState.learners.push({
      id: 'learner_2',
      tenantId: 't1',
      firstName: 'Анна',
      lastName: 'Сидорова',
      snils: '999-999-999 99',
      email: 'secret@example.com'
    });

    await service.composeData('t1', 'admin1', 'learner_2', ctx);
    const events = await audit.list('t1');
    const accessed = events.find((e) => e.action === 'learner.personal_data_accessed');
    const serialised = JSON.stringify(accessed);
    expect(serialised).not.toContain('999-999-999 99');
    expect(serialised).not.toContain('secret@example.com');
    expect(serialised).not.toContain('Сидорова');
  });
});
