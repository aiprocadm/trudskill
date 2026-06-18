import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { EisotTestingRegistryService } from './eisot-testing-registry.service.js';
import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { FakeExportSignatureProvider } from '../../../infrastructure/export-signature/fake-export-signature.provider.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { ExportSignatureProvider } from '../../../infrastructure/export-signature/export-signature.provider.js';
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

function makeHarness(exportSigner?: ExportSignatureProvider) {
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
  const filesCreateDownloadUrl = vi.fn(async () => 'https://signed-url.example/sig');
  const files = {
    register: filesRegister,
    createDownloadUrl: filesCreateDownloadUrl
  } as unknown as FilesService;
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
    audit,
    exportSigner
  );
  return { service, state, storagePut, filesRegister, filesCreateDownloadUrl, auditWrite };
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

  it('exports ALL candidates when there are more than one source page (>1000)', async () => {
    // Regression for the silent 1000-row truncation: 1500 distinct learners, each with
    // one enrollment in a single client group. The old single-page fetch (page_size:1000)
    // capped the export at 1000; full pagination must surface all 1500.
    const h = makeHarness();
    h.state.counterparties.push({
      ...base,
      id: 'cp_big',
      code: 'CPB',
      name: 'ООО Большая',
      inn: '7707083893'
    } as Counterparty);
    h.state.groups.push({
      ...base,
      id: 'grp_big',
      code: 'GB',
      name: 'Большая группа',
      counterpartyId: 'cp_big'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_big',
      code: 'CRSB',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_big',
      courseId: 'crs_big',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_big',
      groupId: 'grp_big',
      courseId: 'crs_big',
      courseVersionId: 'cv_big',
      sortOrder: 0
    } as GroupCourse);
    for (let i = 0; i < 1500; i += 1) {
      h.state.learners.push({
        ...base,
        id: `lrn_big_${i}`,
        firstName: 'Имя',
        lastName: `Фамилия${i}`,
        snils: '112-233-445 95'
      } as Learner);
      h.state.enrollments.push({
        ...base,
        id: `enr_big_${i}`,
        groupId: 'grp_big',
        learnerId: `lrn_big_${i}`,
        status: 'active',
        enrolledAt: '2026-03-10'
      } as Enrollment);
    }

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(1500);
    expect(outcome.total).toBe(1500);
    expect(h.state.eisotTestingRecords).toHaveLength(1500);
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

  it('stamps the batch with a КЭП signature when an export signer is active', async () => {
    const h = makeHarness(new FakeExportSignatureProvider('УЦ'));
    h.state.counterparties.push({
      ...base,
      id: 'cp_sig',
      code: 'CS',
      name: 'ООО Подпись',
      inn: '7707083893'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_sig',
      firstName: 'Сигма',
      lastName: 'Подписант',
      snils: '112-233-445 95',
      dateOfBirth: '1985-01-01',
      position: 'Инженер'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_sig',
      code: 'GS',
      name: 'Группа подпись',
      counterpartyId: 'cp_sig'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_sig',
      code: 'CRSS',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_sig',
      courseId: 'crs_sig',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_sig',
      groupId: 'grp_sig',
      courseId: 'crs_sig',
      courseVersionId: 'cv_sig',
      sortOrder: 0
    } as GroupCourse);
    h.state.enrollments.push({
      ...base,
      id: 'enr_sig',
      groupId: 'grp_sig',
      learnerId: 'lrn_sig',
      status: 'active',
      enrolledAt: '2026-03-10'
    } as Enrollment);

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBeGreaterThan(0);
    const batch = h.state.eisotTestingBatches[0]!;
    expect(batch.signatureStatus).toBe('signed');
    expect(batch.signatureFileId).toBeTruthy();
    expect(batch.signatureCertificateSubject).toContain('УЦ');
    expect(outcome.signatureStatus).toBe('signed');
  });

  it('leaves the batch unsigned when no export signer is configured', async () => {
    const h = makeHarness();
    h.state.counterparties.push({
      ...base,
      id: 'cp_nosig',
      code: 'CN',
      name: 'ООО Без подписи',
      inn: '7707083893'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_nosig',
      firstName: 'Нина',
      lastName: 'Носигнова',
      snils: '112-233-445 95',
      dateOfBirth: '1990-06-15',
      position: 'Бухгалтер'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_nosig',
      code: 'GN',
      name: 'Группа без подписи',
      counterpartyId: 'cp_nosig'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_nosig',
      code: 'CRSN',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_nosig',
      courseId: 'crs_nosig',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_nosig',
      groupId: 'grp_nosig',
      courseId: 'crs_nosig',
      courseVersionId: 'cv_nosig',
      sortOrder: 0
    } as GroupCourse);
    h.state.enrollments.push({
      ...base,
      id: 'enr_nosig',
      groupId: 'grp_nosig',
      learnerId: 'lrn_nosig',
      status: 'active',
      enrolledAt: '2026-03-10'
    } as Enrollment);

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    const batch = h.state.eisotTestingBatches[0]!;
    expect(batch.signatureStatus).toBe('unsigned');
    expect(batch.signatureFileId).toBeUndefined();
    expect(outcome.signatureStatus).toBe('unsigned');
    expect(outcome.signatureFileId).toBeUndefined();
  });

  it('getBatchSignatureUrl returns a download url for a signed batch', async () => {
    const h = makeHarness(new FakeExportSignatureProvider('УЦ'));
    h.state.counterparties.push({
      ...base,
      id: 'cp_surl',
      code: 'CSU',
      name: 'ООО Подпись URL',
      inn: '7707083893'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_surl',
      firstName: 'Урл',
      lastName: 'Подписантов',
      snils: '112-233-445 95',
      dateOfBirth: '1985-03-03',
      position: 'Технолог'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_surl',
      code: 'GSU',
      name: 'Группа surl',
      counterpartyId: 'cp_surl'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_surl',
      code: 'CRSU',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_surl',
      courseId: 'crs_surl',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_surl',
      groupId: 'grp_surl',
      courseId: 'crs_surl',
      courseVersionId: 'cv_surl',
      sortOrder: 0
    } as GroupCourse);
    h.state.enrollments.push({
      ...base,
      id: 'enr_surl',
      groupId: 'grp_surl',
      learnerId: 'lrn_surl',
      status: 'active',
      enrolledAt: '2026-03-10'
    } as Enrollment);

    await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);
    const batch = h.state.eisotTestingBatches[0]!;
    const { url } = await h.service.getBatchSignatureUrl(TENANT, batch.id);

    expect(typeof url).toBe('string');
  });

  it('getBatchSignatureUrl throws when the batch has no signature', async () => {
    const h = makeHarness();
    h.state.counterparties.push({
      ...base,
      id: 'cp_nosurl',
      code: 'CNSU',
      name: 'ООО Без подписи URL',
      inn: '7707083893'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_nosurl',
      firstName: 'Без',
      lastName: 'Урлов',
      snils: '112-233-445 95',
      dateOfBirth: '1992-07-07',
      position: 'Кладовщик'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_nosurl',
      code: 'GNSU',
      name: 'Группа nosurl',
      counterpartyId: 'cp_nosurl'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_nosurl',
      code: 'CRSNU',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_nosurl',
      courseId: 'crs_nosurl',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_nosurl',
      groupId: 'grp_nosurl',
      courseId: 'crs_nosurl',
      courseVersionId: 'cv_nosurl',
      sortOrder: 0
    } as GroupCourse);
    h.state.enrollments.push({
      ...base,
      id: 'enr_nosurl',
      groupId: 'grp_nosurl',
      learnerId: 'lrn_nosurl',
      status: 'active',
      enrolledAt: '2026-03-10'
    } as Enrollment);

    await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);
    const batch = h.state.eisotTestingBatches[0]!;

    await expect(h.service.getBatchSignatureUrl(TENANT, batch.id)).rejects.toThrow();
  });
});
