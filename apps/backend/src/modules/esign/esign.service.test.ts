import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EsignService } from './esign.service.js';
import { InMemoryEsignState } from './in-memory-esign.state.js';

function makeService() {
  const auditService = { write: vi.fn() } as any;
  const documentsService = {
    getDocument: vi.fn().mockReturnValue({ id: 'gdoc_1' }),
    finalizeDocument: vi.fn()
  } as any;
  const realtimeEvents = { publish: vi.fn() } as any;

  return {
    service: new EsignService(
      new InMemoryEsignState(),
      auditService,
      documentsService,
      realtimeEvents
    ),
    auditService,
    documentsService,
    realtimeEvents
  };
}

const ctx = {
  tenantId: 't1',
  requestId: 'r1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  userId: 'u1'
} as any;

describe('EsignService', () => {
  it('enforces verified file before submit and review lifecycle', () => {
    const { service } = makeService();
    const app = service.createApplication('t1', 'learner_1', { learnerId: 'learner_1' }, ctx);

    expect(() => service.submitApplication('t1', 'learner_1', app.id)).toThrow(BadRequestException);

    const file = service.createApplicationFile('t1', 'learner_1', {
      applicationId: app.id,
      fileId: 'file_1'
    });
    service.verifyApplicationFile('t1', 'staff_1', file.id);
    service.submitApplication('t1', 'learner_1', app.id);
    service.startReview('t1', 'staff_1', app.id);
    const approved = service.approveApplication('t1', 'staff_1', app.id);

    expect(approved.status).toBe('approved');
    expect(service.reuseCheck('t1', 'staff_1', app.id).reusable).toBe(true);
  });

  it('is idempotent for process creation/start and participant sign', async () => {
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

    const started = service.startProcess('t1', 'staff_1', process.id, {
      idempotencyKey: 'start-1'
    });
    const startedAgain = service.startProcess('t1', 'staff_1', process.id, {
      idempotencyKey: 'start-1'
    });

    expect(started.status).toBe('in_signing');
    expect(startedAgain.id).toBe(started.id);

    service.inviteParticipant('t1', 'staff_1', p1.id);
    const signed = await service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'sign-1' });
    const signedAgain = await service.signParticipant('t1', 'u2', p1.id, {
      idempotencyKey: 'sign-1'
    });

    expect(signedAgain.id).toBe(signed.id);
    expect(service.getProcess('t1', process.id).status).toBe('signed');
    // actorId здесь = 'u2' (последний подписант, который и триггерит auto-finalize),
    // а не 'staff_1' (создатель процесса). Это семантически верно: audit-event
    // должен указывать на пользователя, чьё действие завершило процесс.
    expect(documentsService.finalizeDocument).toHaveBeenCalledWith(
      't1',
      'u2',
      'gdoc_1',
      expect.objectContaining({ requestId: 'internal-esign' })
    );
  });

  it('does not brick a process started with no participants (recoverable after adding one)', () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'brick-create',
      generatedDocumentId: 'gdoc_1',
      sequential: true
    });

    // Starting with no participants must be rejected...
    expect(() =>
      service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'brick-start-1' })
    ).toThrow(BadRequestException);

    // ...but must NOT strand the process in 'prepared' (validate-first, mutate-last).
    // A stranded 'prepared' bricks it: every retry hits
    // transitionProcess('prepared','prepared') → invalid, and only cancel escapes.
    expect(service.getProcess('t1', process.id).status).toBe('draft');

    // After adding a participant, the operator can start the process normally.
    service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });
    const started = service.startProcess('t1', 'staff_1', process.id, {
      idempotencyKey: 'brick-start-2'
    });
    expect(started.status).toBe('in_signing');
  });

  it('blocks out-of-order signature for sequential process', async () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'k1',
      generatedDocumentId: 'gdoc_1'
    });
    const first = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });
    const second = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u3',
      signOrder: 2
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'k2' });
    service.inviteParticipant('t1', 'staff_1', first.id);
    service.inviteParticipant('t1', 'staff_1', second.id);

    await expect(
      service.signParticipant('t1', 'u3', second.id, { idempotencyKey: 'k3' })
    ).rejects.toThrow(BadRequestException);
  });

  it('does not complete/finalize a process when every participant is skipped (zero real signatures)', async () => {
    const { service, documentsService } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'skip-all-create',
      generatedDocumentId: 'gdoc_1',
      sequential: false
    });
    const p1 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'skip-all-start' });
    service.inviteParticipant('t1', 'staff_1', p1.id);
    await service.skipParticipant('t1', 'staff_1', p1.id, { idempotencyKey: 'skip-1' });

    // A roster where everyone is skipped carries zero signatures — it must NOT be
    // reported as 'signed' nor finalize the (legally-binding) document.
    expect(service.getProcess('t1', process.id).status).not.toBe('signed');
    expect(documentsService.finalizeDocument).not.toHaveBeenCalled();
  });

  it('does not resurrect a cancelled process to signed via skipParticipant', async () => {
    const { service, documentsService } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'resurrect-create',
      generatedDocumentId: 'gdoc_1',
      sequential: false
    });
    const p1 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });
    const p2 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u3',
      signOrder: 2
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'resurrect-start' });
    service.inviteParticipant('t1', 'staff_1', p1.id);
    await service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'resurrect-sign' });

    // Process is still in_signing (p2 pending). Operator cancels it.
    service.cancelProcess('t1', 'staff_1', process.id);
    expect(service.getProcess('t1', process.id).status).toBe('cancelled');
    const finalizeCallsAfterCancel = documentsService.finalizeDocument.mock.calls.length;

    // Skipping the leftover participant on a terminal process must be rejected and
    // must NOT flip the cancelled process back to 'signed'.
    await expect(
      service.skipParticipant('t1', 'staff_1', p2.id, { idempotencyKey: 'resurrect-skip' })
    ).rejects.toThrow(BadRequestException);
    expect(service.getProcess('t1', process.id).status).toBe('cancelled');
    expect(documentsService.finalizeDocument.mock.calls.length).toBe(finalizeCallsAfterCancel);
  });

  it('does not allow rejectParticipant on a terminal (cancelled) process', async () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'reject-terminal-create',
      generatedDocumentId: 'gdoc_1',
      sequential: false
    });
    const p1 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });
    const p2 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u3',
      signOrder: 2
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'reject-terminal-start' });
    service.inviteParticipant('t1', 'staff_1', p1.id);
    service.inviteParticipant('t1', 'staff_1', p2.id); // p2 → invited, so invited→rejected is legal
    await service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'reject-terminal-sign' });

    service.cancelProcess('t1', 'staff_1', process.id);
    expect(service.getProcess('t1', process.id).status).toBe('cancelled');

    // Rejecting a leftover participant on a terminal process must be rejected (mirror of the
    // assertProcessMutable guard on sign/skip): it must NOT flip the participant to 'rejected' nor
    // append a post-cancellation rejection to the append-only legal log.
    expect(() =>
      service.rejectParticipant('t1', 'u3', p2.id, { idempotencyKey: 'reject-terminal-reject' })
    ).toThrow(BadRequestException);
    const p2After = service['state'].participants.find((p) => p.id === p2.id)!;
    expect(p2After.status).toBe('invited');
    expect(service.getProcess('t1', process.id).status).toBe('cancelled');
  });

  it('does not allow inviteParticipant or markViewed on a terminal (cancelled) process', async () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'invite-terminal-create',
      generatedDocumentId: 'gdoc_1',
      sequential: false
    });
    const p1 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });
    const p2 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u3',
      signOrder: 2
    });
    const p3 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u4',
      signOrder: 3
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'invite-terminal-start' });
    service.inviteParticipant('t1', 'staff_1', p1.id);
    service.inviteParticipant('t1', 'staff_1', p3.id); // p3 → invited (so invited→viewed is legal)
    await service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'invite-terminal-sign' });

    service.cancelProcess('t1', 'staff_1', process.id);
    expect(service.getProcess('t1', process.id).status).toBe('cancelled');

    // Inviting/viewing leftover participants on a terminal process must be refused — no participant
    // advancement and no signature.requested / legal-log entry on a dead process.
    expect(() => service.inviteParticipant('t1', 'staff_1', p2.id)).toThrow(BadRequestException);
    expect(() => service.markViewed('t1', 'u4', p3.id)).toThrow(BadRequestException);
    expect(service['state'].participants.find((p) => p.id === p2.id)!.status).toBe('pending');
    expect(service['state'].participants.find((p) => p.id === p3.id)!.status).toBe('invited');
  });

  it('does not falsely complete a process when the target document was revoked mid-signing', async () => {
    const { service, documentsService } = makeService();
    // Document is revoked while the signing process is in flight.
    documentsService.getDocument.mockReturnValue({ id: 'gdoc_1', status: 'revoked' });
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'rev-mid-create',
      generatedDocumentId: 'gdoc_1',
      sequential: false
    });
    const p1 = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });
    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'rev-mid-start' });
    service.inviteParticipant('t1', 'staff_1', p1.id);
    await service.signParticipant('t1', 'u2', p1.id, { idempotencyKey: 'rev-mid-sign' });

    // tryCompleteProcess must validate the document BEFORE mutating the process: a revoked target
    // means the process fails cleanly (no 'signed' status, no false 'completed' legal entry) and
    // finalizeDocument is never called (it would throw AFTER the mutation otherwise).
    expect(service.getProcess('t1', process.id).status).toBe('failed');
    expect(documentsService.finalizeDocument).not.toHaveBeenCalled();
  });

  it('fails process when participant rejects signing', () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'reject-1',
      generatedDocumentId: 'gdoc_1'
    });
    const participant = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'reject-2' });
    service.inviteParticipant('t1', 'staff_1', participant.id);
    service.rejectParticipant('t1', 'u2', participant.id, { idempotencyKey: 'reject-3' });

    expect(service.getProcess('t1', process.id).status).toBe('failed');
  });

  it('prevents participant actions for another user assignment', async () => {
    const { service } = makeService();
    const process = service.createProcess('t1', 'staff_1', {
      idempotencyKey: 'actor-1',
      generatedDocumentId: 'gdoc_1'
    });
    const participant = service.createParticipant('t1', 'staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u2',
      signOrder: 1
    });

    service.startProcess('t1', 'staff_1', process.id, { idempotencyKey: 'actor-2' });
    service.inviteParticipant('t1', 'staff_1', participant.id);

    await expect(
      service.signParticipant('t1', 'u3', participant.id, { idempotencyKey: 'actor-3' })
    ).rejects.toThrow();
  });

  it('keeps tenant isolation for reads', () => {
    const { service } = makeService();
    service.createApplication('t1', 'u1', { learnerId: 'l1' }, ctx);
    service.createApplication(
      't2',
      'u2',
      { learnerId: 'l2' },
      { ...ctx, tenantId: 't2', userId: 'u2' }
    );

    expect(service.listApplications('t1', {}).items).toHaveLength(1);
    expect(service.listApplications('t2', {}).items).toHaveLength(1);
  });

  it('getApplication resolves by tenant when duplicate application ids exist (must is tenant-scoped)', () => {
    const state = new InMemoryEsignState();
    const auditService = { write: vi.fn() } as any;
    const documentsService = {
      getDocument: vi.fn().mockReturnValue({ id: 'gdoc_1' }),
      finalizeDocument: vi.fn()
    } as any;
    const realtimeEvents = { publish: vi.fn() } as any;
    const service = new EsignService(state, auditService, documentsService, realtimeEvents);

    const now = new Date().toISOString();
    const sharedId = 'esapp_duplicate_id_cross_tenant';
    state.applications.push({
      id: sharedId,
      tenantId: 'tenant_a',
      learnerId: 'learner_a',
      status: 'draft',
      createdAt: now,
      updatedAt: now
    });
    state.applications.push({
      id: sharedId,
      tenantId: 'tenant_b',
      learnerId: 'learner_b',
      status: 'draft',
      createdAt: now,
      updatedAt: now
    });

    expect(service.getApplication('tenant_a', sharedId).learnerId).toBe('learner_a');
    expect(service.getApplication('tenant_b', sharedId).learnerId).toBe('learner_b');
    expect(() => service.getApplication('tenant_a', 'esapp_only_other_tenant')).toThrow(
      NotFoundException
    );
  });
});
