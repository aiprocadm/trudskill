import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EsignService } from './esign.service.js';

function makeService() {
  const auditService = { write: vi.fn() } as any;
  const documentsService = {
    getDocument: vi.fn().mockReturnValue({ id: 'gdoc_1' }),
    finalizeDocument: vi.fn()
  } as any;
  const realtimeEvents = { publish: vi.fn() } as any;

  return {
    service: new EsignService(auditService, documentsService, realtimeEvents),
    auditService,
    documentsService,
    realtimeEvents
  };
}

const ctx = { tenantId: 't1', requestId: 'r1', ip: '127.0.0.1', userAgent: 'vitest', userId: 'u1' } as any;

describe('EsignService', () => {
  it('enforces verified file before submit and review lifecycle', () => {
    const { service } = makeService();
    const app = service.createApplication('t1', 'learner_1', { learnerId: 'learner_1' }, ctx);

    expect(() => service.submitApplication('t1', 'learner_1', app.id)).toThrow(BadRequestException);

    const file = service.createApplicationFile('t1', 'learner_1', { applicationId: app.id, fileId: 'file_1' });
    service.verifyApplicationFile('t1', 'staff_1', file.id);
    service.submitApplication('t1', 'learner_1', app.id);
    service.startReview('t1', 'staff_1', app.id);
    const approved = service.approveApplication('t1', 'staff_1', app.id);

    expect(approved.status).toBe('approved');
    expect(service.reuseCheck('t1', 'staff_1', app.id).reusable).toBe(true);
  });

  it('is idempotent for process creation/start and participant sign', () => {
    const { service, documentsService } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'create-key',
      generatedDocumentId: 'gdoc_1',
      sequential: true
    });
    const secondCreate = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'create-key',
      generatedDocumentId: 'gdoc_1',
      sequential: true
    });

    expect(secondCreate.id).toBe(process.id);

    const p1 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });

    const started = service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'start-1' });
    const startedAgain = service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'start-1' });

    expect(started.status).toBe('in_signing');
    expect(startedAgain.id).toBe(started.id);

    service.inviteParticipant('t1', 'staff_1', p1.id);
    const signed = service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'sign-1' });
    const signedAgain = service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'sign-1' });

    expect(signedAgain.id).toBe(signed.id);
    expect(service.getProcess('t1', process.id).status).toBe('signed');
    expect(documentsService.finalizeDocument).toHaveBeenCalledWith('t1', 'gdoc_1');
  });

  it('blocks out-of-order signature for sequential process', () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', { idempotencyKey: 'k1', generatedDocumentId: 'gdoc_1' });
    const first = service.createParticipant('t1', 'staff_1', { processId: process.id, participantType: 'employee', participantUserId: 'u2', signOrder: 1 });
    const second = service.createParticipant('t1', 'staff_1', { processId: process.id, participantType: 'employee', participantUserId: 'u3', signOrder: 2 });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'k2' });
    service.inviteParticipant('t1', 'staff_1', first.id);
    service.inviteParticipant('t1', 'staff_1', second.id);

    expect(() => service.signParticipant('t1', 'u3', second.id, { idempotencyKey: 'k3' })).toThrow(BadRequestException);
  });

  it('keeps tenant isolation for reads', () => {
    const { service } = makeService();
    service.createApplication('t1', 'u1', { learnerId: 'l1' }, ctx);
    service.createApplication('t2', 'u2', { learnerId: 'l2' }, { ...ctx, tenantId: 't2', userId: 'u2' });

    expect(service.listApplications('t1', {}).items).toHaveLength(1);
    expect(service.listApplications('t2', {}).items).toHaveLength(1);
  });
});
