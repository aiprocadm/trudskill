import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateNmoRow } from './nmo-preflight.js';
import { buildNmoRows } from './nmo-rows.js';
import { NmoXlsxWriter } from './nmo-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { NmoDocumentBundle } from './nmo-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { NmoBatch, NmoExportOutcome, NmoRecord, NmoRow, NmoRowError } from '../mvp.types.js';

export interface NmoExportFilter {
  from?: string;
  to?: string;
  types?: ('certificate' | 'diploma')[];
  groupId?: string;
  clientId?: string;
}

/**
 * Phase 6 — Минздрав-НМО (непрерывное медобразование, ЗЕТ): exports issued education
 * documents to a provisional `.xlsx` for manual upload to the НМО portal. Mirrors the
 * ФРДО archetype (document-driven). Request-scoped, shares MVP_STATE; partial-success.
 * `specialty` and `creditUnits` (ЗЕТ) are PROVISIONAL swap-points.
 */
@Injectable({ scope: Scope.REQUEST })
export class NmoRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(NmoXlsxWriter) private readonly xlsx: NmoXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportNmoRegistry(
    tenantId: string,
    filter: NmoExportFilter,
    ctx: RequestContext
  ): Promise<NmoExportOutcome> {
    const docs = this.documents
      .listIssuedDocuments(tenantId, {
        types: filter.types?.length ? filter.types : ['certificate', 'diploma'],
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.to ? { to: filter.to } : {})
      })
      .items.filter((d) => !d.revokedAt && d.status !== 'archived' && d.status !== 'revoked');

    const gatherErrors: NmoRowError[] = [];
    const bundles: NmoDocumentBundle[] = [];
    for (const document of docs) {
      try {
        if (document.sourceEntityType !== 'enrollment') continue;
        const enrollment = this.mvp.getEnrollment(tenantId, document.sourceEntityId);
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;
        if (filter.groupId && enrollment.groupId !== filter.groupId) continue;

        const gc = this.mvp.listGroupCourses(tenantId, {
          group_id: enrollment.groupId,
          page_size: 1000
        }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;
        const cv = gc?.courseVersionId
          ? this.mvp.getCourseVersion(tenantId, gc.courseVersionId)
          : undefined;

        bundles.push({
          document,
          enrollment,
          learner,
          programName: course?.title ?? '',
          // SWAP-POINT — специальность пока пустая (нет источника); заполнить при наличии.
          specialty: '',
          // SWAP-POINT — ЗЕТ провизорно = академические часы программы.
          ...(cv?.academicHours !== undefined ? { creditUnits: cv.academicHours } : {})
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

    const rows = buildNmoRows(bundles);
    const valid: NmoRow[] = [];
    const preflightErrors: NmoRowError[] = [];
    for (const r of rows) {
      const e = validateNmoRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const failed = new Set(errors.map((e) => e.documentId)).size;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: NmoBatch = {
      id: this.id('nmb'),
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
      const storageKey = `${tenantId}/nmo-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `nmo-registry-${batch.id}.xlsx`,
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

    this.state.nmoRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.nmoRegistryRecords.push({
        id: this.id('nmr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        documentId: r.documentId,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        documentNumber: r.documentNumber
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.nmo_exported',
      entityType: 'nmo_batch',
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

  listBatches(tenantId: string): NmoBatch[] {
    return this.state.nmoRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(tenantId: string, id: string): { batch: NmoBatch; records: NmoRecord[] } {
    const batch = this.state.nmoRegistryBatches.find((b) => b.tenantId === tenantId && b.id === id);
    if (!batch) {
      throw new NotFoundException({
        code: 'nmo_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.nmoRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'nmo_file_not_found',
        message: 'Batch has no generated file'
      });
    }
    return { url: await this.files.createDownloadUrl(tenantId, batch.fileId) };
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}
