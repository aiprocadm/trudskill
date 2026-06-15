import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateRostechnadzorRow } from './rostechnadzor-preflight.js';
import { buildRostechnadzorRows } from './rostechnadzor-rows.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';
import { collectAllPages } from '../registry-pagination.js';

import type { RostechnadzorBundle } from './rostechnadzor-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  Learner,
  RostechnadzorBatch,
  RostechnadzorExportOutcome,
  RostechnadzorRecord,
  RostechnadzorRow,
  RostechnadzorRowError
} from '../mvp.types.js';

export interface RostechnadzorExportFilter {
  groupId?: string;
  clientId?: string;
  enrolledFrom?: string;
  enrolledTo?: string;
}

/**
 * Phase 6 — Ростехнадзор (промышленная безопасность): exports completed,
 * exam-passed enrollments to a provisional `.xlsx` for manual upload. Mirrors the
 * ОТ-registry archetype (only passed knowledge-checks; protocol from documents).
 * Request-scoped, shares MVP_STATE; partial-success (valid rows exported, invalid
 * surfaced per-field; fully-invalid batch → no file). `attestationArea` is PROVISIONAL.
 */
@Injectable({ scope: Scope.REQUEST })
export class RostechnadzorRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(RostechnadzorXlsxWriter) private readonly xlsx: RostechnadzorXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportRostechnadzorRegistry(
    tenantId: string,
    filter: RostechnadzorExportFilter,
    ctx: RequestContext
  ): Promise<RostechnadzorExportOutcome> {
    // Exhaust every page so a tenant with >1000 candidates is never silently truncated.
    const completed = collectAllPages((page, pageSize) =>
      this.mvp.listEnrollments(tenantId, {
        group_id: filter.groupId,
        enrolled_from: filter.enrolledFrom,
        enrolled_to: filter.enrolledTo,
        page,
        page_size: pageSize
      })
    ).filter((e) => e.status === 'completed');

    // `listEnrollments` ignores enrolled_from/to (documented in-memory gap), so
    // re-apply the date scope on `enrolledAt` (ISO lexicographic compare is correct).
    const enrollments = completed.filter(
      (e) =>
        (!filter.enrolledFrom || (e.enrolledAt ? e.enrolledAt >= filter.enrolledFrom : false)) &&
        (!filter.enrolledTo || (e.enrolledAt ? e.enrolledAt <= filter.enrolledTo : false))
    );

    const gatherErrors: RostechnadzorRowError[] = [];
    const bundles: RostechnadzorBundle[] = [];
    for (const enrollment of enrollments) {
      try {
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;

        const counterparty = group.counterpartyId
          ? this.mvp.getCounterparty(tenantId, group.counterpartyId)
          : undefined;

        const gc = this.mvp.listGroupCourses(tenantId, {
          group_id: enrollment.groupId,
          page_size: 1000
        }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;

        const protocol = this.documents.listDocuments(tenantId, {
          documentType: 'protocol',
          sourceEntityType: 'enrollment',
          sourceEntityId: enrollment.id,
          pageSize: 1
        }).items[0];

        const exam = this.mvp.getExamResultByEnrollment(tenantId, enrollment.id)[0];
        if (!exam?.passed) {
          gatherErrors.push({
            enrollmentId: enrollment.id,
            learnerId: enrollment.learnerId,
            fullName: this.fullName(learner),
            field: 'result',
            message: 'Нет сданного результата проверки знаний (выгружаются только сданные)'
          });
          continue;
        }

        bundles.push({
          enrollment,
          learner,
          employerName: counterparty?.name ?? '',
          employerInn: counterparty?.inn ?? '',
          // SWAP-POINT — провизорно: область аттестации = наименование курса/программы.
          attestationArea: course?.title ?? '',
          protocol: {
            documentNumber: protocol?.documentNumber ?? '',
            documentDate: protocol?.documentDate ?? ''
          }
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

    const rows = buildRostechnadzorRows(bundles);
    const valid: RostechnadzorRow[] = [];
    const preflightErrors: RostechnadzorRowError[] = [];
    for (const r of rows) {
      const e = validateRostechnadzorRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const validIds = new Set(valid.map((r) => r.enrollmentId));
    const failed = new Set(
      errors.map((e) => e.enrollmentId).filter((id) => id && !validIds.has(id))
    ).size;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: RostechnadzorBatch = {
      id: this.id('rtb'),
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
      const storageKey = `${tenantId}/rostechnadzor-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `rostechnadzor-registry-${batch.id}.xlsx`,
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

    this.state.rostechnadzorRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.rostechnadzorRegistryRecords.push({
        id: this.id('rtr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        protocolNumber: r.protocolNumber
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.rostechnadzor_exported',
      entityType: 'rostechnadzor_batch',
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

  listBatches(tenantId: string): RostechnadzorBatch[] {
    return this.state.rostechnadzorRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: RostechnadzorBatch; records: RostechnadzorRecord[] } {
    const batch = this.state.rostechnadzorRegistryBatches.find(
      (b) => b.tenantId === tenantId && b.id === id
    );
    if (!batch) {
      throw new NotFoundException({
        code: 'rostechnadzor_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.rostechnadzorRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'rostechnadzor_file_not_found',
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
