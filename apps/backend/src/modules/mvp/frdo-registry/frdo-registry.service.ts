import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateFrdoRow } from './frdo-registry-preflight.js';
import { buildFrdoRows } from './frdo-registry-rows.js';
import { FrdoRegistryXlsxWriter } from './frdo-registry-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { FrdoDocumentBundle } from './frdo-registry-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  FrdoRegistryBatch,
  FrdoRegistryExportOutcome,
  FrdoRegistryRecord,
  FrdoRegistryRow,
  FrdoRegistryRowError,
  Learner
} from '../mvp.types.js';

export interface FrdoRegistryExportFilter {
  from?: string;
  to?: string;
  types?: ('certificate' | 'diploma')[];
  groupId?: string;
  clientId?: string;
}

/**
 * Wave 2 sub-goal A — ФИС ФРДО (Рособрнадзор): exports issued education documents
 * (удостоверения ПК / дипломы ПП) to a provisional `.xlsx` for manual upload.
 * Request-scoped, shares MVP_STATE; partial-success principle (valid rows exported,
 * invalid surfaced per-field; a fully-invalid batch produces NO file).
 */
@Injectable({ scope: Scope.REQUEST })
export class FrdoRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(FrdoRegistryXlsxWriter) private readonly xlsx: FrdoRegistryXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportFrdoRegistry(
    tenantId: string,
    filter: FrdoRegistryExportFilter,
    ctx: RequestContext
  ): Promise<FrdoRegistryExportOutcome> {
    const kindsByType = new Map(
      this.mvp.listFrdoDocumentKinds().map((k) => [k.templateType as string, k])
    );

    // Issuance journal returns all generated docs; include issued (generated|final),
    // exclude archived/revoked. NOT `status:'final'` only — issued certs may sit in
    // 'generated' depending on the issuance flow; filtering 'final' risks silently
    // exporting nothing.
    const docs = this.documents
      .listIssuedDocuments(tenantId, {
        types: filter.types?.length ? filter.types : ['certificate', 'diploma'],
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.to ? { to: filter.to } : {})
      })
      .items.filter((d) => !d.revokedAt && d.status !== 'archived' && d.status !== 'revoked');

    const gatherErrors: FrdoRegistryRowError[] = [];
    const bundles: FrdoDocumentBundle[] = [];
    for (const document of docs) {
      try {
        if (document.sourceEntityType !== 'enrollment') continue;
        const enrollment = this.mvp.getEnrollment(tenantId, document.sourceEntityId);
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;
        if (filter.groupId && enrollment.groupId !== filter.groupId) continue;

        const gc = this.mvp.listGroupCourses(tenantId, { group_id: enrollment.groupId }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;
        const cv = gc?.courseVersionId
          ? this.mvp.getCourseVersion(tenantId, gc.courseVersionId)
          : undefined;

        const kind = kindsByType.get(document.documentType);
        if (!kind) {
          gatherErrors.push({
            documentId: document.id,
            learnerId: learner.id,
            fullName: this.fullName(learner),
            field: 'documentKind',
            message: 'Вид документа не сопоставлен классификатору ФРДО'
          });
          continue;
        }

        bundles.push({
          document,
          enrollment,
          learner,
          kind,
          programName: course?.title ?? '',
          ...(cv?.academicHours !== undefined ? { academicHours: cv.academicHours } : {})
        });
      } catch {
        gatherErrors.push({
          documentId: document.id,
          learnerId: '',
          fullName: '',
          field: 'document',
          message: 'Не удалось собрать данные документа (отсутствует связанная сущность)'
        });
      }
    }

    const rows = buildFrdoRows(bundles);
    const valid: FrdoRegistryRow[] = [];
    const preflightErrors: FrdoRegistryRowError[] = [];
    for (const r of rows) {
      const e = validateFrdoRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const failed = errors.length;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: FrdoRegistryBatch = {
      id: this.id('frb'),
      tenantId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      sourceFilterJson: { ...filter },
      totalCandidates: total,
      exportedRows: exported,
      failedRows: failed,
      batchStatus: failed ? (exported ? 'partial' : 'failed') : 'generated',
      generatedBy: ctx.userId ?? ''
    };

    if (exported) {
      const buffer = await this.xlsx.build(valid);
      const storageKey = `${tenantId}/frdo-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `frdo-registry-${batch.id}.xlsx`,
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

    this.state.frdoRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.frdoRegistryRecords.push({
        id: this.id('frr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        documentId: r.documentId,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        documentKindCode: r.documentKindCode,
        registrationNumber: r.registrationNumber,
        snils: r.snils
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.frdo_exported',
      entityType: 'frdo_registry_batch',
      entityId: batch.id,
      newValues: { exported, failed, batchStatus: batch.batchStatus },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    return {
      batchId: batch.id,
      fileId: batch.fileId,
      total,
      exported,
      failed,
      rows: valid,
      errors
    };
  }

  listBatches(tenantId: string): FrdoRegistryBatch[] {
    return this.state.frdoRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: FrdoRegistryBatch; records: FrdoRegistryRecord[] } {
    const batch = this.state.frdoRegistryBatches.find(
      (b) => b.tenantId === tenantId && b.id === id
    );
    if (!batch) {
      throw new NotFoundException({
        code: 'frdo_registry_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.frdoRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'frdo_registry_file_not_found',
        message: 'Batch has no generated file'
      });
    }
    return { url: await this.files.createDownloadUrl(tenantId, batch.fileId) };
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }

  private fullName(l: Learner): string {
    return [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();
  }
}
