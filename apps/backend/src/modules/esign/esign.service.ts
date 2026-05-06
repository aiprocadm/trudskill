import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ESIGN_STATE } from './esign-state.token.js';
import { EsignStateMachine } from './esign.policy.js';
import { InMemoryEsignState } from './in-memory-esign.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { DocumentsService } from '../documents/documents.service.js';

import type {
  CreateEsignApplicationFileRequest,
  CreateEsignApplicationRequest,
  CreateSigningParticipantRequest,
  CreateSigningProcessRequest,
  EsignBaseFilter,
  ParticipantActionRequest,
  RejectEsignApplicationFileRequest,
  RejectEsignApplicationRequest,
  StartSigningProcessRequest,
  UpdateEsignApplicationRequest,
  UpdateSigningParticipantRequest
} from './esign.dto.js';
import type {
  EsignApplicationEntity,
  EsignApplicationFileEntity,
  SigningParticipantEntity,
  SigningProcessEntity
} from './esign.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Injectable()
export class EsignService {
  constructor(
    @Inject(ESIGN_STATE) private readonly state: InMemoryEsignState,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
    @Inject(RealtimeEventsService) private readonly realtimeEvents: RealtimeEventsService
  ) {}

  listApplications(tenantId: string, q: EsignBaseFilter) {
    return this.page(
      this.state.applications.filter((x) => x.tenantId === tenantId),
      q
    );
  }
  getApplication(tenantId: string, id: string) {
    return this.must(this.state.applications, tenantId, id);
  }
  createApplication(
    tenantId: string,
    actorId: string | undefined,
    req: CreateEsignApplicationRequest,
    ctx: RequestContext
  ) {
    const now = this.now();
    const entity: EsignApplicationEntity = {
      id: this.id('esapp'),
      tenantId,
      learnerId: req.learnerId,
      status: 'draft',
      expiresAt: req.expiresAt,
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    this.state.applications.push(entity);
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application',
      entity.id,
      'esign.application.created',
      'Application created',
      entity
    );
    this.writeAudit(
      tenantId,
      actorId,
      'esign.application_created',
      'esign.application',
      entity.id,
      entity,
      ctx
    );
    return entity;
  }
  updateApplication(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: UpdateEsignApplicationRequest
  ) {
    const application = this.getApplication(tenantId, id);
    if (application.status !== 'draft')
      throw new BadRequestException('Only draft application can be updated');
    application.expiresAt = req.expiresAt ?? application.expiresAt;
    application.updatedAt = this.now();
    application.updatedBy = actorId;
    return application;
  }
  submitApplication(tenantId: string, actorId: string | undefined, id: string) {
    const app = this.getApplication(tenantId, id);
    EsignStateMachine.transitionApplication(app.status, 'submitted');
    if (
      !this.state.applicationFiles.some(
        (file) =>
          file.tenantId === tenantId && file.applicationId === app.id && file.status === 'verified'
      )
    )
      throw new BadRequestException('At least one verified file is required before submit');
    app.status = 'submitted';
    app.submittedAt = this.now();
    app.updatedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application',
      app.id,
      'esign.application.submitted',
      'Application submitted',
      { submittedAt: app.submittedAt }
    );
    this.publishRealtime(tenantId, 'esign.application.submitted', { applicationId: app.id });
    return app;
  }
  startReview(tenantId: string, actorId: string | undefined, id: string) {
    const app = this.getApplication(tenantId, id);
    EsignStateMachine.transitionApplication(app.status, 'under_review');
    app.status = 'under_review';
    app.reviewedBy = actorId;
    app.reviewedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application',
      app.id,
      'esign.application.review_started',
      'Review started',
      {}
    );
    return app;
  }
  approveApplication(tenantId: string, actorId: string | undefined, id: string) {
    const app = this.getApplication(tenantId, id);
    EsignStateMachine.transitionApplication(app.status, 'approved');
    app.status = 'approved';
    app.approvedAt = this.now();
    app.updatedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application',
      app.id,
      'esign.application.approved',
      'Application approved',
      { approvedAt: app.approvedAt }
    );
    this.publishRealtime(tenantId, 'esign.application.approved', { applicationId: app.id });
    return app;
  }
  rejectApplication(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: RejectEsignApplicationRequest
  ) {
    const app = this.getApplication(tenantId, id);
    EsignStateMachine.transitionApplication(app.status, 'rejected');
    app.status = 'rejected';
    app.rejectionReason = req.reason;
    app.updatedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application',
      app.id,
      'esign.application.rejected',
      'Application rejected',
      { reason: req.reason }
    );
    this.publishRealtime(tenantId, 'esign.application.rejected', { applicationId: app.id });
    return app;
  }
  reuseCheck(tenantId: string, actorId: string | undefined, id: string) {
    const app = this.getApplication(tenantId, id);
    EsignStateMachine.assertApplicationReusable(app.status);
    EsignStateMachine.transitionApplication(app.status, 'reused');
    app.status = 'reused';
    app.updatedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application',
      app.id,
      'esign.application.reused',
      'Application marked as reused',
      {}
    );
    return { reusable: true, application: app };
  }

  listApplicationFiles(tenantId: string, q: EsignBaseFilter) {
    return this.page(
      this.state.applicationFiles.filter((x) => x.tenantId === tenantId),
      q
    );
  }
  getApplicationFile(tenantId: string, id: string) {
    return this.must(this.state.applicationFiles, tenantId, id);
  }
  createApplicationFile(
    tenantId: string,
    actorId: string | undefined,
    req: CreateEsignApplicationFileRequest
  ) {
    const app = this.getApplication(tenantId, req.applicationId);
    if (app.status !== 'draft')
      throw new BadRequestException('Files can only be uploaded for draft applications');
    const now = this.now();
    const row: EsignApplicationFileEntity = {
      id: this.id('esfile'),
      tenantId,
      applicationId: req.applicationId,
      fileId: req.fileId,
      status: 'uploaded',
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    this.state.applicationFiles.push(row);
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application_file',
      row.id,
      'esign.application_file.uploaded',
      'Application file uploaded',
      { applicationId: row.applicationId, fileId: row.fileId }
    );
    return row;
  }
  verifyApplicationFile(tenantId: string, actorId: string | undefined, id: string) {
    const row = this.getApplicationFile(tenantId, id);
    const app = this.getApplication(tenantId, row.applicationId);
    if (app.status !== 'draft')
      throw new BadRequestException('Can only verify file while application is draft');
    row.status = 'verified';
    row.verifiedBy = actorId;
    row.verifiedAt = this.now();
    row.updatedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application_file',
      row.id,
      'esign.application_file.verified',
      'Application file verified',
      { applicationId: row.applicationId }
    );
    return row;
  }
  rejectApplicationFile(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: RejectEsignApplicationFileRequest
  ) {
    const row = this.getApplicationFile(tenantId, id);
    const app = this.getApplication(tenantId, row.applicationId);
    if (app.status !== 'draft')
      throw new BadRequestException('Can only reject file while application is draft');
    row.status = 'rejected';
    row.rejectionReason = req.reason;
    row.updatedBy = actorId;
    row.updatedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application_file',
      row.id,
      'esign.application_file.rejected',
      'Application file rejected',
      { reason: req.reason }
    );
    return row;
  }
  deleteApplicationFile(tenantId: string, id: string, actorId?: string) {
    const row = this.getApplicationFile(tenantId, id);
    const app = this.getApplication(tenantId, row.applicationId);
    if (app.status !== 'draft')
      throw new BadRequestException('Can only delete files for draft application');
    this.state.applicationFiles = this.state.applicationFiles.filter(
      (x) => !(x.tenantId === tenantId && x.id === id)
    );
    this.writeLegal(
      tenantId,
      actorId,
      'esign.application_file',
      id,
      'esign.application_file.deleted',
      'Application file deleted',
      { applicationId: row.applicationId }
    );
    return { deleted: true };
  }

  listProcesses(tenantId: string, q: EsignBaseFilter) {
    return this.page(
      this.state.processes.filter((x) => x.tenantId === tenantId),
      q
    );
  }
  getProcess(tenantId: string, id: string) {
    return this.must(this.state.processes, tenantId, id);
  }
  createProcess(tenantId: string, actorId: string | undefined, req: CreateSigningProcessRequest) {
    const idem = `${tenantId}:proc-create:${req.idempotencyKey}`;
    const existing = this.state.idempotency.get(idem);
    if (existing) return this.getProcess(tenantId, existing);
    this.documentsService.getDocument(tenantId, req.generatedDocumentId);
    if (req.applicationId)
      EsignStateMachine.assertApplicationEligibleForSigning(
        this.getApplication(tenantId, req.applicationId).status
      );
    if (
      this.state.processes.some(
        (x) =>
          x.tenantId === tenantId &&
          x.generatedDocumentId === req.generatedDocumentId &&
          x.status === 'signed'
      )
    )
      throw new BadRequestException('Signed artifact already exists for this generated document');
    const now = this.now();
    const row: SigningProcessEntity = {
      id: this.id('esproc'),
      tenantId,
      applicationId: req.applicationId,
      generatedDocumentId: req.generatedDocumentId,
      status: 'draft',
      sequential: req.sequential ?? true,
      snapshot: req.snapshot ?? {},
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    this.state.processes.push(row);
    this.state.idempotency.set(idem, row.id);
    this.writeLegal(
      tenantId,
      actorId,
      'esign.process',
      row.id,
      'esign.process.created',
      'Signing process created',
      row
    );
    return row;
  }
  startProcess(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: StartSigningProcessRequest
  ) {
    const idem = `${tenantId}:proc-start:${id}:${req.idempotencyKey}`;
    if (this.state.idempotency.has(idem)) return this.getProcess(tenantId, id);
    const process = this.getProcess(tenantId, id);
    EsignStateMachine.transitionProcess(process.status, 'prepared');
    process.status = 'prepared';
    const hasParticipants = this.state.participants.some(
      (x) => x.tenantId === tenantId && x.processId === process.id
    );
    if (!hasParticipants)
      throw new BadRequestException('Cannot start signing process without participants');
    EsignStateMachine.transitionProcess(process.status, 'awaiting_participants');
    process.status = 'awaiting_participants';
    EsignStateMachine.transitionProcess(process.status, 'in_signing');
    process.status = 'in_signing';
    process.startedAt = this.now();
    process.updatedAt = this.now();
    this.state.idempotency.set(idem, process.id);
    this.writeSignatureEvent(tenantId, process.id, undefined, 'signature.requested', {
      processId: process.id
    });
    this.writeLegal(
      tenantId,
      actorId,
      'esign.process',
      process.id,
      'esign.process.started',
      'Signing process started',
      {}
    );
    return process;
  }
  cancelProcess(tenantId: string, actorId: string | undefined, id: string) {
    const process = this.getProcess(tenantId, id);
    EsignStateMachine.transitionProcess(process.status, 'cancelled');
    process.status = 'cancelled';
    process.finishedAt = this.now();
    process.terminalSnapshot = { cancelledAt: process.finishedAt };
    this.writeLegal(
      tenantId,
      actorId,
      'esign.process',
      process.id,
      'esign.process.cancelled',
      'Signing process cancelled',
      {}
    );
    return process;
  }
  getProcessStatus(tenantId: string, id: string) {
    const p = this.getProcess(tenantId, id);
    return { id: p.id, status: p.status, startedAt: p.startedAt, finishedAt: p.finishedAt };
  }

  listParticipants(tenantId: string, q: EsignBaseFilter) {
    return this.page(
      this.state.participants.filter(
        (x) => x.tenantId === tenantId && (!q.processId || x.processId === q.processId)
      ),
      q
    );
  }
  createParticipant(
    tenantId: string,
    actorId: string | undefined,
    req: CreateSigningParticipantRequest
  ) {
    const process = this.getProcess(tenantId, req.processId);
    EsignStateMachine.assertProcessMutable(process);
    if (
      this.state.participants.some(
        (x) =>
          x.tenantId === tenantId && x.processId === req.processId && x.signOrder === req.signOrder
      )
    )
      throw new BadRequestException('Participant sign_order must be unique within process');
    const now = this.now();
    const row: SigningParticipantEntity = {
      id: this.id('espart'),
      tenantId,
      processId: req.processId,
      participantType: req.participantType,
      participantUserId: req.participantUserId,
      signOrder: req.signOrder,
      status: 'pending',
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now
    };
    this.state.participants.push(row);
    return row;
  }
  updateParticipant(tenantId: string, id: string, req: UpdateSigningParticipantRequest) {
    const p = this.must(this.state.participants, tenantId, id);
    EsignStateMachine.assertProcessMutable(this.getProcess(tenantId, p.processId));
    if (req.signOrder !== undefined) p.signOrder = req.signOrder;
    if (req.expiresAt !== undefined) p.expiresAt = req.expiresAt;
    p.updatedAt = this.now();
    return p;
  }
  inviteParticipant(tenantId: string, actorId: string | undefined, id: string) {
    const p = this.must(this.state.participants, tenantId, id);
    EsignStateMachine.transitionParticipant(p.status, 'invited');
    p.status = 'invited';
    p.invitedAt = this.now();
    this.writeSignatureEvent(tenantId, p.processId, p.id, 'signature.requested', {
      participantId: p.id
    });
    this.writeLegal(
      tenantId,
      actorId,
      'esign.participant',
      p.id,
      'esign.participant.invited',
      'Participant invited',
      { processId: p.processId }
    );
    return p;
  }
  markViewed(tenantId: string, actorId: string | undefined, id: string) {
    const p = this.must(this.state.participants, tenantId, id);
    EsignStateMachine.assertParticipantActor(p.participantUserId, actorId);
    EsignStateMachine.transitionParticipant(p.status, 'viewed');
    p.status = 'viewed';
    p.viewedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.participant',
      p.id,
      'esign.participant.viewed',
      'Participant viewed signature request',
      {}
    );
    return p;
  }
  signParticipant(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: ParticipantActionRequest
  ) {
    const p = this.must(this.state.participants, tenantId, id);
    EsignStateMachine.assertParticipantActor(p.participantUserId, actorId);
    const idem = `${tenantId}:participant-sign:${id}:${req.idempotencyKey}`;
    if (this.state.idempotency.has(idem)) return p;
    if (p.status === 'signed') return p;
    const process = this.getProcess(tenantId, p.processId);
    EsignStateMachine.assertProcessMutable(process);
    EsignStateMachine.assertSigningOrder(
      process,
      p,
      this.state.participants.filter((x) => x.tenantId === tenantId && x.processId === p.processId)
    );
    EsignStateMachine.transitionParticipant(p.status, 'signed');
    p.status = 'signed';
    p.signedAt = this.now();
    EsignStateMachine.assertSignedHasSignedAt(p.status, p.signedAt);
    this.writeSignatureEvent(tenantId, p.processId, p.id, 'signature.completed', req.payload ?? {});
    this.publishRealtime(tenantId, 'signature.completed', {
      processId: p.processId,
      participantId: p.id
    });
    this.writeLegal(
      tenantId,
      actorId,
      'esign.participant',
      p.id,
      'esign.participant.signed',
      'Participant signed',
      { processId: p.processId }
    );
    this.state.idempotency.set(idem, p.id);
    this.tryCompleteProcess(tenantId, actorId, p.processId);
    return p;
  }
  rejectParticipant(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: ParticipantActionRequest
  ) {
    const p = this.must(this.state.participants, tenantId, id);
    EsignStateMachine.assertParticipantActor(p.participantUserId, actorId);
    EsignStateMachine.transitionParticipant(p.status, 'rejected');
    p.status = 'rejected';
    p.rejectedAt = this.now();
    this.writeSignatureEvent(tenantId, p.processId, p.id, 'signature.rejected', req.payload ?? {});
    this.writeLegal(
      tenantId,
      actorId,
      'esign.participant',
      p.id,
      'esign.participant.rejected',
      'Participant rejected signing',
      {}
    );
    this.failProcess(tenantId, actorId, p.processId, 'Participant rejected signing');
    return p;
  }
  skipParticipant(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    req: ParticipantActionRequest
  ) {
    const p = this.must(this.state.participants, tenantId, id);
    EsignStateMachine.transitionParticipant(p.status, 'skipped');
    p.status = 'skipped';
    p.skippedAt = this.now();
    this.writeLegal(
      tenantId,
      actorId,
      'esign.participant',
      p.id,
      'esign.participant.skipped',
      'Participant skipped',
      req.payload ?? {}
    );
    this.tryCompleteProcess(tenantId, actorId, p.processId);
    return p;
  }

  listEvents(tenantId: string, q: EsignBaseFilter) {
    return this.page(
      this.state.signatureEvents.filter(
        (x) => x.tenantId === tenantId && (!q.processId || x.processId === q.processId)
      ),
      q
    );
  }
  getEvent(tenantId: string, id: string) {
    return this.must(this.state.signatureEvents, tenantId, id);
  }
  listLegalLog(tenantId: string, q: EsignBaseFilter) {
    return this.page(
      this.state.legalLogEntries.filter(
        (x) => x.tenantId === tenantId && (!q.eventType || x.eventType === q.eventType)
      ),
      q
    );
  }
  getLegalLogEntry(tenantId: string, id: string) {
    return this.must(this.state.legalLogEntries, tenantId, id);
  }

  private tryCompleteProcess(tenantId: string, actorId: string | undefined, processId: string) {
    const process = this.getProcess(tenantId, processId);
    const participants = this.state.participants.filter(
      (x) => x.tenantId === tenantId && x.processId === processId
    );
    if (participants.some((x) => !['signed', 'skipped'].includes(x.status))) return;
    process.status = 'signed';
    process.finishedAt = this.now();
    process.terminalSnapshot = {
      participants: participants.map((p) => ({ id: p.id, status: p.status, signedAt: p.signedAt }))
    };
    this.writeSignatureEvent(tenantId, process.id, undefined, 'signing.process.completed', {
      finishedAt: process.finishedAt
    });
    this.writeLegal(
      tenantId,
      actorId,
      'esign.process',
      process.id,
      'signing.process.completed',
      'Signing process completed',
      { finishedAt: process.finishedAt }
    );
    this.publishRealtime(tenantId, 'signing.process.completed', { processId: process.id });
    this.documentsService.finalizeDocument(tenantId, process.generatedDocumentId);
  }

  private failProcess(
    tenantId: string,
    actorId: string | undefined,
    processId: string,
    reason: string
  ) {
    const process = this.getProcess(tenantId, processId);
    if (['signed', 'failed', 'cancelled'].includes(process.status)) return process;
    EsignStateMachine.transitionProcess(process.status, 'failed');
    process.status = 'failed';
    process.finishedAt = this.now();
    process.terminalSnapshot = { failedAt: process.finishedAt, reason };
    this.writeSignatureEvent(tenantId, process.id, undefined, 'signing.process.failed', { reason });
    this.writeLegal(
      tenantId,
      actorId,
      'esign.process',
      process.id,
      'signing.process.failed',
      'Signing process failed',
      { reason }
    );
    return process;
  }

  private writeSignatureEvent(
    tenantId: string,
    processId: string,
    participantId: string | undefined,
    eventType: string,
    payload: unknown
  ) {
    this.state.signatureEvents.push({
      id: this.id('esevent'),
      tenantId,
      processId,
      participantId,
      eventType,
      payload: (payload as Record<string, unknown>) ?? {},
      createdAt: this.now()
    });
  }
  private writeLegal(
    tenantId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    eventType: string,
    description: string,
    payload: unknown
  ) {
    this.state.legalLogEntries.push({
      id: this.id('eslegal'),
      tenantId,
      actorId,
      entityType,
      entityId,
      eventType,
      description,
      payload: (payload as Record<string, unknown>) ?? {},
      createdAt: this.now()
    });
  }
  private writeAudit(
    tenantId: string,
    actorId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    newValues: unknown,
    ctx: RequestContext
  ) {
    this.auditService.write({
      tenantId,
      actorId,
      action,
      entityType,
      entityId,
      newValues: (newValues as Record<string, unknown>) ?? {},
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
  }
  private publishRealtime(tenantId: string, eventName: string, payload: Record<string, unknown>) {
    this.realtimeEvents.publish({
      event_name: eventName,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: this.now(),
      payload
    });
  }
  private page<T>(rows: T[], q: EsignBaseFilter) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    return {
      items: rows.slice(start, start + pageSize),
      meta: { page, pageSize, total: rows.length }
    };
  }
  private must<T extends { tenantId: string; id: string }>(
    rows: T[],
    tenantId: string,
    id: string
  ): T {
    const value = rows.find((x) => x.tenantId === tenantId && x.id === id);
    if (!value) throw new NotFoundException('Entity not found');
    return value;
  }
  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  private now() {
    return new Date().toISOString();
  }
}
