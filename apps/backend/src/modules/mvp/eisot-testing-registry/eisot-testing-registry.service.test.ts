import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { EisotTestingRegistryService } from './eisot-testing-registry.service.js';
import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';
import type {
  Counterparty,
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

function makeHarness() {
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
  const service = new EisotTestingRegistryService(
    state,
    mvp,
    files,
    storage,
    new EisotTestingXlsxWriter(),
    audit
  );
  return { service, state, storagePut, filesRegister, auditWrite };
}

describe('EisotTestingRegistryService.exportEisotTestingRegistry', () => {
  it('exports one deduped row per learner, persists batch + records, writes file', async () => {
    const h = makeHarness();
    h.state.counterparties.push({
      ...base,
      id: 'cp_1',
      code: 'C1',
      name: 'ООО Ромашка',
      inn: '7707083893'
    } as Counterparty);
    h.state.counterparties.push({
      ...base,
      id: 'cp_2',
      code: 'C2',
      name: 'ООО Вторая',
      inn: '7736050003'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_1',
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Иванович',
      snils: '112-233-445 95',
      dateOfBirth: '1990-05-01',
      position: 'Электрик'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_1',
      code: 'G1',
      name: 'Группа 1',
      counterpartyId: 'cp_1'
    } as GroupEntity);
    h.state.groups.push({
      ...base,
      id: 'grp_2',
      code: 'G2',
      name: 'Группа 2',
      counterpartyId: 'cp_2'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_1',
      code: 'CRS1',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_1',
      courseId: 'crs_1',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_1',
      groupId: 'grp_1',
      courseId: 'crs_1',
      courseVersionId: 'cv_1',
      sortOrder: 0
    } as GroupCourse);
    // Two enrollments for the SAME learner in two groups → deduped to one row.
    h.state.enrollments.push({
      ...base,
      id: 'enr_1',
      groupId: 'grp_1',
      learnerId: 'lrn_1',
      status: 'active',
      enrolledAt: '2026-03-10'
    } as Enrollment);
    h.state.enrollments.push({
      ...base,
      id: 'enr_2',
      groupId: 'grp_2',
      learnerId: 'lrn_1',
      status: 'active',
      enrolledAt: '2026-03-11'
    } as Enrollment);

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(1); // deduped by learner
    expect(outcome.failed).toBe(0);
    expect(outcome.fileId).toBe('file_x');
    expect(outcome.rows[0]!.lastName).toBe('Иванов');
    expect(outcome.rows[0]!.employerInn).toBe('7707083893'); // first group (grp_1) wins
    expect(outcome.rows[0]!.programName).toBe('Охрана труда');
    expect(h.state.eisotTestingBatches).toHaveLength(1);
    expect(h.state.eisotTestingBatches[0]!.batchStatus).toBe('generated');
    expect(h.state.eisotTestingRecords).toHaveLength(1);
    expect(h.storagePut).toHaveBeenCalledTimes(1);
    expect(h.auditWrite.mock.calls[0]![0]).toMatchObject({
      action: 'regulatory.eisot_testing_exported',
      entityType: 'eisot_testing_batch'
    });
  });

  it('excludes cancelled enrollments and fails a row with no employer', async () => {
    const h = makeHarness();
    // Active enrollment whose group has NO counterparty → employerName blank → hard error.
    h.state.learners.push({
      ...base,
      id: 'lrn_2',
      firstName: 'Пётр',
      lastName: 'Петров'
    } as Learner);
    h.state.groups.push({ ...base, id: 'grp_x', code: 'GX', name: 'Без клиента' } as GroupEntity);
    h.state.enrollments.push({
      ...base,
      id: 'enr_x',
      groupId: 'grp_x',
      learnerId: 'lrn_2',
      status: 'active',
      enrolledAt: '2026-03-12'
    } as Enrollment);
    // Cancelled enrollment → excluded entirely (must not count toward total).
    h.state.counterparties.push({
      ...base,
      id: 'cp_3',
      code: 'C3',
      name: 'ООО Третья',
      inn: '7728168971'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_3',
      firstName: 'Анна',
      lastName: 'Сидорова'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_y',
      code: 'GY',
      name: 'Группа Y',
      counterpartyId: 'cp_3'
    } as GroupEntity);
    h.state.enrollments.push({
      ...base,
      id: 'enr_y',
      groupId: 'grp_y',
      learnerId: 'lrn_3',
      status: 'cancelled',
      enrolledAt: '2026-03-13'
    } as Enrollment);

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(0);
    expect(outcome.errors.some((e) => e.field === 'employerName')).toBe(true);
    expect(outcome.fileId).toBeUndefined();
    expect(outcome.total).toBe(1); // cancelled enr_y excluded; only enr_x is a candidate
    expect(h.state.eisotTestingBatches[0]!.batchStatus).toBe('failed');
    expect(h.storagePut).not.toHaveBeenCalled();
  });
});
