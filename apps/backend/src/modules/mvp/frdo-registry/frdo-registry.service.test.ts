import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { FrdoRegistryXlsxWriter } from './frdo-registry-xlsx.writer.js';
import { FrdoRegistryService } from './frdo-registry.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { FilesService } from '../../files/files.service.js';
import type {
  Course,
  CourseVersion,
  Enrollment,
  GroupCourse,
  GroupEntity,
  Learner
} from '../mvp.types.js';

const TENANT = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: TENANT,
  userId: 'u',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};
const base = { tenantId: TENANT, status: 'active' as const, createdAt: 't', updatedAt: 't' };

function seed(state: InMemoryMvpState): void {
  state.learners.push({
    ...base,
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-01'
  } as Learner);
  state.groups.push({
    ...base,
    id: 'grp_1',
    code: 'G1',
    name: 'Группа',
    counterpartyId: 'cp_1'
  } as GroupEntity);
  state.courses.push({
    ...base,
    id: 'crs_1',
    code: 'C1',
    title: 'Охрана труда',
    isArchived: false
  } as Course);
  state.courseVersions.push({
    ...base,
    id: 'cv_1',
    courseId: 'crs_1',
    versionNo: 1,
    academicHours: 40
  } as CourseVersion);
  state.groupCourses.push({
    ...base,
    id: 'gc_1',
    groupId: 'grp_1',
    courseId: 'crs_1',
    courseVersionId: 'cv_1',
    sortOrder: 0
  } as GroupCourse);
  state.enrollments.push({
    ...base,
    id: 'enr_1',
    groupId: 'grp_1',
    learnerId: 'lrn_1',
    status: 'completed',
    enrolledAt: '2026-01-01'
  } as Enrollment);
}

function makeHarness(docs: Partial<GeneratedDocumentEntity>[]) {
  const state = new InMemoryMvpState();
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    {
      listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
    } as unknown as DocumentsService,
    { ensureMaterialLink: async () => undefined } as unknown as FilesService,
    new EventEmitter2()
  );
  const documents = {
    listIssuedDocuments: vi.fn((_t: string, f: { offset?: number; limit?: number }) => {
      const offset = f.offset ?? 0;
      const limit = f.limit !== undefined && f.limit > 0 ? f.limit : docs.length;
      return { items: docs.slice(offset, offset + limit), total: docs.length };
    })
  } as unknown as DocumentsService;
  const filesRegister = vi.fn(async (m: { tenantId: string }) => ({
    id: 'file_x',
    tenantId: m.tenantId,
    storageKey: 'k',
    originalName: 'n',
    mimeType: 'm',
    sizeBytes: 1,
    createdAt: 't'
  }));
  const files = { register: filesRegister } as unknown as FilesService;
  const storagePut = vi.fn(async () => undefined);
  const storage = { putObject: storagePut } as unknown as S3StorageClient;
  const auditWrite = vi.fn();
  const audit = { write: auditWrite } as unknown as AuditService;
  const service = new FrdoRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new FrdoRegistryXlsxWriter(),
    audit
  );
  return { service, state, documents, storagePut, filesRegister, auditWrite };
}

const doc = (over: Partial<GeneratedDocumentEntity> = {}): Partial<GeneratedDocumentEntity> => ({
  id: 'doc_1',
  documentType: 'certificate',
  documentNumber: 'УД-000123',
  documentDate: '2026-03-10',
  status: 'final',
  sourceEntityType: 'enrollment',
  sourceEntityId: 'enr_1',
  ...over
});

describe('FrdoRegistryService.exportFrdoRegistry', () => {
  it('exports one row per issued document, persists batch + records, writes file', async () => {
    const h = makeHarness([doc()]);
    seed(h.state);

    const outcome = await h.service.exportFrdoRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(1);
    expect(outcome.failed).toBe(0);
    expect(outcome.fileId).toBe('file_x');
    expect(outcome.rows[0]!.registrationNumber).toBe('УД-000123');
    expect(outcome.rows[0]!.programName).toBe('Охрана труда');
    expect(h.state.frdoRegistryBatches).toHaveLength(1);
    expect(h.state.frdoRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(h.state.frdoRegistryRecords).toHaveLength(1);
    expect(h.storagePut).toHaveBeenCalledTimes(1);
    expect(h.auditWrite.mock.calls[0]![0]).toMatchObject({
      action: 'regulatory.frdo_exported',
      entityType: 'frdo_registry_batch'
    });
  });

  it('exports ALL issued documents across more than one source page (>1000)', async () => {
    // Regression for the silent 1000-row truncation on the `listIssuedDocuments`
    // archetype: 1500 issued certificates behind an offset/limit pager. The exporter
    // must walk every page (offset/limit) rather than reading a single capped page.
    const docs = Array.from({ length: 1500 }, (_, i) =>
      doc({ id: `doc_${i}`, documentNumber: `УД-${i}` })
    );
    const h = makeHarness(docs);
    seed(h.state);

    const outcome = await h.service.exportFrdoRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(1500);
    expect(h.state.frdoRegistryRecords).toHaveLength(1500);
    // 1500 docs / 1000 page → page 1 (offset 0) then page 2 (offset 1000).
    expect(h.documents.listIssuedDocuments).toHaveBeenCalledTimes(2);
  });

  it('excludes revoked documents and reports unmatched kinds as errors', async () => {
    const h = makeHarness([
      doc({ id: 'doc_rev', revokedAt: '2026-04-01' }),
      doc({ id: 'doc_bad', documentType: 'protocol' })
    ]);
    seed(h.state);

    const outcome = await h.service.exportFrdoRegistry(TENANT, {}, ctx);

    // revoked dropped before join; protocol has no ФРДО kind → error, no file.
    expect(outcome.exported).toBe(0);
    expect(outcome.errors.some((e) => e.field === 'documentKind')).toBe(true);
    expect(outcome.fileId).toBeUndefined();
    expect(h.state.frdoRegistryBatches[0]!.batchStatus).toBe('failed');
  });

  it('counts one failed document once even with multiple field errors', async () => {
    // documentNumber + documentDate both empty → 2 preflight errors on 1 document.
    const h = makeHarness([doc({ documentNumber: '', documentDate: '' })]);
    seed(h.state);

    const outcome = await h.service.exportFrdoRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(0);
    expect(outcome.failed).toBe(1); // one document, not the error-object count
    expect(outcome.errors.length).toBeGreaterThanOrEqual(2);
    expect(h.state.frdoRegistryBatches[0]!.failedRows).toBe(1);
  });
});
