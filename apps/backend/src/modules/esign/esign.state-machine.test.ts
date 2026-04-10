import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EsignService } from './esign.service.js';

const makeService = () => {
  const auditService = { write: vi.fn() } as any;
  const documentsService = {
    getDocument: vi.fn().mockReturnValue({ id: 'gdoc_1' }),
    finalizeDocument: vi.fn()
  } as any;
  const realtimeEvents = { publish: vi.fn() } as any;

  return new EsignService(auditService, documentsService, realtimeEvents);
};

const ctx = { tenantId: 't1', requestId: 'r1', ip: '127.0.0.1', userAgent: 'vitest', userId: 'u1' } as any;

describe('EsignService state machine', () => {
  it('blocks process start when there are no participants', () => {
    const service = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'proc-no-participants',
      generatedDocumentId: 'gdoc_1',
      sequential: true
    });

    expect(() => service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'start-no-participants' })).toThrow(BadRequestException);
  });

  it('prevents process mutation after terminal signed state', () => {
    const service = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'proc-signed-1',
      generatedDocumentId: 'gdoc_1',
      sequential: true
    });

    const participant = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u_signer',
      signOrder: 1
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'proc-start-1' });
    service.inviteParticipant('t1', 'staff_1', participant.id);
    service.signParticipant('t1', 'u_signer', participant.id, { idempotencyKey: 'proc-sign-1' });

    expect(service.getProcess('t1', process.id).status).toBe('signed');
    expect(() =>
      service.createParticipant('t1', 'staff_1', {
        processId: process.id,
        participantType: 'employee',
        participantUserId: 'u_signer_2',
        signOrder: 2
      })
    ).toThrow(BadRequestException);
  });

  it('stores terminal snapshot after failed process transition', () => {
    const service = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'proc-fail-1',
      generatedDocumentId: 'gdoc_1',
      sequential: true
    });
    const participant = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u_signer',
      signOrder: 1
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'proc-fail-start' });
    service.inviteParticipant('t1', 'staff_1', participant.id);
    service.rejectParticipant('t1', 'u_signer', participant.id, { idempotencyKey: 'proc-fail-reject' });

    const failed = service.getProcess('t1', process.id);
    expect(failed.status).toBe('failed');
    expect(failed.terminalSnapshot).toBeDefined();
  });

  it('writes legal log entries for application lifecycle transitions', () => {
    const service = makeService();
    const application = service.createApplication('t1', 'learner_1', { learnerId: 'learner_1' }, ctx);
    const file = service.createApplicationFile('t1', 'learner_1', { applicationId: application.id, fileId: 'file_1' });

    service.verifyApplicationFile('t1', 'staff_1', file.id);
    service.submitApplication('t1', 'learner_1', application.id);
    service.startReview('t1', 'staff_1', application.id);
    service.approveApplication('t1', 'staff_1', application.id);

    const events = service.listLegalLog('t1', {}).items.map((item) => item.eventType);
    expect(events).toContain('esign.application.created');
    expect(events).toContain('esign.application.approved');
  });
});
