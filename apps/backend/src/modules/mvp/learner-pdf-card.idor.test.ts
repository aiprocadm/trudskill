import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { InMemoryDocumentsState } from '../documents/in-memory-documents.state.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctxB: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tenantB',
  userId: 'admin_b',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

describe('IDOR — learner-pdf-card cannot read across tenant', () => {
  it('composeData throws 404 when called by tenantB for tenantA learner', async () => {
    const mvpState = new InMemoryMvpState();
    const audit = new AuditService();
    const docService = new DocumentsService(
      new InMemoryDocumentsState(),
      audit,
      new RealtimeEventsService()
    );
    const service = new LearnerPdfCardService(mvpState, docService, audit);

    mvpState.learners.push({
      id: 'learner_a',
      tenantId: 'tenantA',
      firstName: 'Анна',
      lastName: 'Иванова',
      snils: '111-111-111 11'
    });

    await expect(service.composeData('tenantB', 'admin_b', 'learner_a', ctxB)).rejects.toThrow(
      NotFoundException
    );
  });
});
