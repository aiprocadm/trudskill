import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateEisotTestingRow } from './eisot-testing-preflight.js';
import { buildEisotTestingRows } from './eisot-testing-rows.js';
import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { EisotTestingBundle } from './eisot-testing-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  EisotTestingBatch,
  EisotTestingExportOutcome,
  EisotTestingRecord,
  EisotTestingRow,
  EisotTestingRowError
} from '../mvp.types.js';

export interface EisotTestingExportFilter {
  from?: string; // referral date (enrolledAt) range start, ISO
  to?: string; // referral date (enrolledAt) range end, ISO
  groupId?: string;
  clientId?: string;
}

/**
 * Wave 2 sub-goal C — ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ): exports a roster
 * of learners directed to a knowledge check to a provisional `.xlsx` for manual upload.
 * Source = enrollments by filter (group / period / client), deduped to one row per
 * learner — NOT exams or documents. Request-scoped, shares MVP_STATE; partial-success
 * principle (valid rows exported, invalid surfaced per-field; fully-invalid batch → no file).
 */
@Injectable({ scope: Scope.REQUEST })
export class EisotTestingRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(EisotTestingXlsxWriter) private readonly xlsx: EisotTestingXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportEisotTestingRegistry(
    tenantId: string,
    filter: EisotTestingExportFilter,
    ctx: RequestContext
  ): Promise<EisotTestingExportOutcome> {
    // `listEnrollments` honours `group_id` but IGNORES `enrolled_from`/`enrolled_to`
    // (same in-memory gap OT FIX #3 documented), so re-apply the referral-date scope on
    // `enrolledAt` here. Exclude `cancelled` — a withdrawn learner is not sent to testing.
    const enrollments = this.mvp
      .listEnrollments(tenantId, { group_id: filter.groupId, page_size: 1000 })
      .items.filter(
        (e) =>
          e.status !== 'cancelled' &&
          (!filter.from || (e.enrolledAt ? e.enrolledAt >= filter.from : false)) &&
          (!filter.to || (e.enrolledAt ? e.enrolledAt <= filter.to : false))
      );

    const gatherErrors: EisotTestingRowError[] = [];
    const bundles: EisotTestingBundle[] = [];
    const seenLearners = new Set<string>();
    for (const enrollment of enrollments) {
      try {
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;

        // Dedup by learner — first matching enrollment wins (employer/program from it).
        if (seenLearners.has(learner.id)) continue;
        seenLearners.add(learner.id);

        const counterparty = group.counterpartyId
          ? this.mvp.getCounterparty(tenantId, group.counterpartyId)
          : undefined;
        const gc = this.mvp.listGroupCourses(tenantId, {
          group_id: enrollment.groupId,
          page_size: 1000
        }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;

        bundles.push({
          enrollment,
          learner,
          employerName: counterparty?.name ?? '',
          employerInn: counterparty?.inn ?? '',
          programName: course?.title ?? ''
        });
      } catch {
        gatherErrors.push({
          enrollmentId: enrollment.id,
          learnerId: enrollment.learnerId,
          fullName: '',
          field: 'enrollment',
          message: 'Не удалось собрать данные зачисления (отсутствует связанная сущность)'
        });
      }
    }

    const rows = buildEisotTestingRows(bundles);
    const valid: EisotTestingRow[] = [];
    const preflightErrors: EisotTestingRowError[] = [];
    for (const r of rows) {
      const e = validateEisotTestingRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const validLearnerIds = new Set(valid.map((r) => r.learnerId));
    // Count distinct FAILED learners, excluding any that also produced a valid row (a learner
    // deduped across groups could surface in both) — one candidate = one learner.
    const failed = new Set(
      errors.map((e) => e.learnerId).filter((id) => id && !validLearnerIds.has(id))
    ).size;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: EisotTestingBatch = {
      id: this.id('etb'),
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
      const storageKey = `${tenantId}/eisot-testing/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `eisot-testing-${batch.id}.xlsx`,
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

    this.state.eisotTestingBatches.push(batch);
    for (const r of valid) {
      this.state.eisotTestingRecords.push({
        id: this.id('etr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        employerInn: r.employerInn
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.eisot_testing_exported',
      entityType: 'eisot_testing_batch',
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

  listBatches(tenantId: string): EisotTestingBatch[] {
    return this.state.eisotTestingBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: EisotTestingBatch; records: EisotTestingRecord[] } {
    const batch = this.state.eisotTestingBatches.find(
      (b) => b.tenantId === tenantId && b.id === id
    );
    if (!batch) {
      throw new NotFoundException({
        code: 'eisot_testing_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.eisotTestingRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'eisot_testing_file_not_found',
        message: 'Batch has no generated file'
      });
    }
    return { url: await this.files.createDownloadUrl(tenantId, batch.fileId) };
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}
