import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateRegistryRow } from './ot-registry-preflight.js';
import { matchResponseToRecords, parseRegistryResponse } from './ot-registry-response.parser.js';
import { buildRegistryRows } from './ot-registry-rows.js';
import { OtRegistryXlsxWriter } from './ot-registry-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { EnrollmentBundle } from './ot-registry-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  OtRegistryBatch,
  OtRegistryExportOutcome,
  OtRegistryImportOutcome,
  OtRegistryRecord,
  OtRegistryRow,
  OtRegistryRowError,
  OtTrainingProgram
} from '../mvp.types.js';

export interface OtRegistryExportFilter {
  groupId?: string;
  clientId?: string;
  enrolledFrom?: string;
  enrolledTo?: string;
}

/**
 * Wave 2 — ОТ-реестр (Минтруд/ЕИСОТ): the integration service. Gathers completed
 * ОТ enrollments, builds + preflights the registry rows, generates the `.xlsx`,
 * stores it, and persists a durable batch + per-record set.
 *
 * Request-scoped (like `MvpService`) so it shares the same per-request
 * `MVP_STATE` instance — mutations to `otRegistryBatches`/`otRegistryRecords`
 * are persisted at the request boundary by `MvpRequestPersistenceInterceptor`.
 *
 * Partial-success principle: valid rows are exported, invalid rows are reported
 * per-field; a fully-invalid batch produces NO file (`fileId` undefined).
 */
@Injectable({ scope: Scope.REQUEST })
export class OtRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(OtRegistryXlsxWriter) private readonly xlsx: OtRegistryXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportOtRegistry(
    tenantId: string,
    filter: OtRegistryExportFilter,
    ctx: RequestContext
  ): Promise<OtRegistryExportOutcome> {
    const programsByCode = new Map(this.mvp.listOtTrainingPrograms().map((p) => [p.code, p]));

    const enrollments = this.mvp
      .listEnrollments(tenantId, {
        group_id: filter.groupId,
        enrolled_from: filter.enrolledFrom,
        enrolled_to: filter.enrolledTo,
        page_size: 1000
      })
      .items.filter((e) => e.status === 'completed');

    const bundles: EnrollmentBundle[] = [];
    for (const enrollment of enrollments) {
      const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
      const group = this.mvp.getGroup(tenantId, enrollment.groupId);

      // Optional client (counterparty) filter — skip enrollments whose group is
      // not linked to the requested client.
      if (filter.clientId && group.counterpartyId !== filter.clientId) {
        continue;
      }

      const employerInn = group.counterpartyId
        ? (this.mvp.getCounterparty(tenantId, group.counterpartyId).inn ?? '')
        : '';

      const groupCourse = this.mvp.listGroupCourses(tenantId, { group_id: enrollment.groupId })
        .items[0];
      const cv = groupCourse?.courseVersionId
        ? this.mvp.getCourseVersion(tenantId, groupCourse.courseVersionId)
        : undefined;
      const codes = cv?.otProgramCodes ?? [];
      const programs = codes
        .map((c) => programsByCode.get(c))
        .filter((p): p is OtTrainingProgram => Boolean(p));

      const protocol = this.documents.listDocuments(tenantId, {
        documentType: 'protocol',
        sourceEntityType: 'enrollment',
        sourceEntityId: enrollment.id,
        pageSize: 1
      }).items[0];

      const exam = this.mvp.getExamResultByEnrollment(tenantId, enrollment.id)[0];

      bundles.push({
        enrollment,
        learner,
        employerInn,
        protocol: {
          documentNumber: protocol?.documentNumber ?? '',
          documentDate: protocol?.documentDate ?? ''
        },
        examPassed: Boolean(exam?.passed),
        // Always emit at least one row so an unmapped course surfaces as a
        // preflight error rather than silently vanishing.
        programs: programs.length
          ? programs
          : [{ code: '', registryId: 0, exactName: '', programKind: 'other', isActive: true }]
      });
    }

    const rows = buildRegistryRows(bundles);
    const valid: OtRegistryRow[] = [];
    const errors: OtRegistryRowError[] = [];
    for (const r of rows) {
      const rowErrors = validateRegistryRow(r);
      if (rowErrors.length) {
        errors.push(...rowErrors);
      } else {
        valid.push(r);
      }
    }

    const now = new Date().toISOString();
    const batch: OtRegistryBatch = {
      id: this.id('otb'),
      tenantId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      sourceFilterJson: { ...filter },
      totalCandidates: rows.length,
      exportedRows: valid.length,
      failedRows: errors.length,
      batchStatus: errors.length ? (valid.length ? 'partial' : 'failed') : 'generated',
      generatedBy: ctx.userId ?? ''
    };

    if (valid.length) {
      const buffer = await this.xlsx.build(valid);
      const storageKey = `${tenantId}/ot-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `ot-registry-${batch.id}.xlsx`,
        mimeType: this.xlsx.contentType,
        sizeBytes: buffer.length,
        antivirusStatus: 'clean'
      });
      await this.storage.putObject({
        key: storageKey,
        body: buffer,
        contentType: this.xlsx.contentType
      });
      batch.fileId = meta.id;
    }

    this.state.otRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.otRegistryRecords.push({
        id: this.id('otr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        programCode: r.programCode,
        programRegistryId: r.programRegistryId,
        protocolNumber: r.protocolNumber
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.ot_registry_exported',
      entityType: 'ot_registry_batch',
      entityId: batch.id,
      newValues: {
        exported: valid.length,
        failed: errors.length,
        batchStatus: batch.batchStatus
      },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    return {
      batchId: batch.id,
      fileId: batch.fileId,
      total: rows.length,
      exported: valid.length,
      failed: errors.length,
      rows: valid,
      errors
    };
  }

  /** Batches for the tenant, newest first. */
  listBatches(tenantId: string): OtRegistryBatch[] {
    return this.state.otRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: OtRegistryBatch; records: OtRegistryRecord[] } {
    const batch = this.state.otRegistryBatches.find((b) => b.tenantId === tenantId && b.id === id);
    if (!batch) {
      throw new NotFoundException({
        code: 'ot_registry_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.otRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'ot_registry_file_not_found',
        message: 'Batch has no generated file'
      });
    }
    const url = await this.files.createDownloadUrl(tenantId, batch.fileId);
    return { url };
  }

  async importRegistryResponse(
    tenantId: string,
    batchId: string,
    fileBase64: string,
    ctx: RequestContext
  ): Promise<OtRegistryImportOutcome> {
    const records = this.state.otRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === batchId
    );
    const parsed = await parseRegistryResponse(Buffer.from(fileBase64, 'base64'));
    const outcome = matchResponseToRecords(parsed, records);
    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.ot_registry_response_imported',
      entityType: 'ot_registry_batch',
      entityId: batchId,
      newValues: {
        matched: outcome.matched,
        unmatched: outcome.unmatched
      },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return outcome;
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}
