import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

import { OtRegistryXlsxWriter } from './ot-registry-xlsx.writer.js';
import { OtRegistryService } from './ot-registry.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { OtRegistryExportFilter } from './ot-registry.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { FilesService } from '../../files/files.service.js';
import type {
  Counterparty,
  CourseVersion,
  Enrollment,
  ExamResult,
  GroupCourse,
  GroupEntity,
  Learner
} from '../mvp.types.js';

const TENANT = 'tenant_demo';

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: TENANT,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

// A СНИЛС that passes the ПФР checksum (reused from ot-registry-rows.test.ts).
const VALID_SNILS = '112-233-445 95';

interface SeedOptions {
  snils?: string;
  /** otProgramCodes mapped onto the course version. */
  programCodes?: string[];
  /** `true`/`false` push an exam result; `null` pushes none (simulates «нет результата»). */
  examPassed?: boolean | null;
}

interface Harness {
  service: OtRegistryService;
  state: InMemoryMvpState;
  mvp: MvpService;
  storagePut: ReturnType<typeof vi.fn>;
  filesRegister: ReturnType<typeof vi.fn>;
  auditWrite: ReturnType<typeof vi.fn>;
}

function seedCompletedEnrollment(state: InMemoryMvpState, opts: SeedOptions = {}): void {
  const base = { tenantId: TENANT, status: 'active' as const, createdAt: 't', updatedAt: 't' };

  const counterparty: Counterparty = {
    ...base,
    id: 'cp_1',
    code: 'CP1',
    name: 'ООО Ромашка',
    inn: '7707083893'
  };
  const learner: Learner = {
    ...base,
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: opts.snils ?? VALID_SNILS,
    position: 'Слесарь'
  };
  const group: GroupEntity = {
    ...base,
    id: 'grp_1',
    code: 'G1',
    name: 'Группа 1',
    counterpartyId: 'cp_1'
  };
  const courseVersion: CourseVersion = {
    ...base,
    id: 'cv_1',
    courseId: 'crs_1',
    versionNo: 1,
    otProgramCodes: opts.programCodes ?? ['OT_A', 'OT_FIRST_AID']
  } as CourseVersion;
  const groupCourse: GroupCourse = {
    ...base,
    id: 'gc_1',
    groupId: 'grp_1',
    courseId: 'crs_1',
    courseVersionId: 'cv_1',
    sortOrder: 0
  };
  const enrollment: Enrollment = {
    ...base,
    id: 'enr_1',
    groupId: 'grp_1',
    learnerId: 'lrn_1',
    status: 'completed',
    enrolledAt: '2026-01-01',
    completedAt: '2026-03-10'
  };
  const examResult: ExamResult = {
    tenantId: TENANT,
    id: 'exr_1',
    status: 'active',
    createdAt: 't',
    updatedAt: 't',
    testId: 'tst_1',
    enrollmentId: 'enr_1',
    learnerId: 'lrn_1',
    attemptsCount: 1,
    maxScore: 100,
    passed: opts.examPassed ?? true
  };

  state.counterparties.push(counterparty);
  state.learners.push(learner);
  state.groups.push(group);
  state.courseVersions.push(courseVersion);
  state.groupCourses.push(groupCourse);
  state.enrollments.push(enrollment);
  // `examPassed: null` simulates «нет результата проверки знаний» — push nothing.
  if (opts.examPassed !== null) {
    state.examResults.push(examResult);
  }
}

interface SeedNamedOptions extends SeedOptions {
  /** Distinct id suffix so multiple enrollments coexist (`enr_${suffix}` …). */
  suffix: string;
  enrolledAt?: string;
  counterpartyId?: string;
}

/**
 * Seed a second/Nth completed enrollment with distinct ids so partial-success
 * scenarios (one good + one bad) can be exercised. Each gets its own learner,
 * group, counterparty, course version and group-course.
 */
function seedNamedCompletedEnrollment(state: InMemoryMvpState, opts: SeedNamedOptions): void {
  const base = { tenantId: TENANT, status: 'active' as const, createdAt: 't', updatedAt: 't' };
  const s = opts.suffix;
  const cpId = opts.counterpartyId ?? `cp_${s}`;

  const counterparty: Counterparty = {
    ...base,
    id: cpId,
    code: `CP${s}`,
    name: `ООО ${s}`,
    inn: '7707083893'
  };
  const learner: Learner = {
    ...base,
    id: `lrn_${s}`,
    firstName: 'Пётр',
    lastName: 'Петров',
    middleName: 'Петрович',
    snils: opts.snils ?? VALID_SNILS,
    position: 'Слесарь'
  };
  const group: GroupEntity = {
    ...base,
    id: `grp_${s}`,
    code: `G${s}`,
    name: `Группа ${s}`,
    counterpartyId: cpId
  };
  const courseVersion: CourseVersion = {
    ...base,
    id: `cv_${s}`,
    courseId: `crs_${s}`,
    versionNo: 1,
    otProgramCodes: opts.programCodes ?? ['OT_A']
  } as CourseVersion;
  const groupCourse: GroupCourse = {
    ...base,
    id: `gc_${s}`,
    groupId: `grp_${s}`,
    courseId: `crs_${s}`,
    courseVersionId: `cv_${s}`,
    sortOrder: 0
  };
  const enrollment: Enrollment = {
    ...base,
    id: `enr_${s}`,
    groupId: `grp_${s}`,
    learnerId: `lrn_${s}`,
    status: 'completed',
    enrolledAt: opts.enrolledAt ?? '2026-01-01',
    completedAt: '2026-03-10'
  };
  const examResult: ExamResult = {
    tenantId: TENANT,
    id: `exr_${s}`,
    status: 'active',
    createdAt: 't',
    updatedAt: 't',
    testId: `tst_${s}`,
    enrollmentId: `enr_${s}`,
    learnerId: `lrn_${s}`,
    attemptsCount: 1,
    maxScore: 100,
    passed: opts.examPassed ?? true
  };

  state.counterparties.push(counterparty);
  state.learners.push(learner);
  state.groups.push(group);
  state.courseVersions.push(courseVersion);
  state.groupCourses.push(groupCourse);
  state.enrollments.push(enrollment);
  // Only push an exam result when one is wanted — omit to simulate «no result».
  if (opts.examPassed !== null) {
    state.examResults.push(examResult);
  }
}

function makeHarness(): Harness {
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

  // One protocol per enrollment with a valid number + date.
  const protocol = {
    documentNumber: 'ПР-12/2026',
    documentDate: '2026-03-10'
  } as GeneratedDocumentEntity;
  const documents = {
    listDocuments: vi.fn(() => ({ items: [protocol], page: 1, pageSize: 1, total: 1 }))
  } as unknown as DocumentsService;

  const filesRegister = vi.fn(async (meta: { tenantId: string }) => ({
    id: 'file_x',
    tenantId: meta.tenantId,
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

  const service = new OtRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new OtRegistryXlsxWriter(),
    audit
  );

  return { service, state, mvp, storagePut, filesRegister, auditWrite };
}

const noFilter: OtRegistryExportFilter = {};

describe('OtRegistryService.exportOtRegistry', () => {
  it('exports two rows for a комплексный course (2 programs), persists batch + records, writes file', async () => {
    const h = makeHarness();
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A', 'OT_FIRST_AID'], examPassed: true });

    const outcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);

    expect(outcome.exported).toBe(2);
    expect(outcome.failed).toBe(0);
    expect(outcome.total).toBe(2);
    expect(outcome.fileId).toBeTruthy();
    expect(outcome.errors).toHaveLength(0);
    expect(outcome.rows.map((r) => r.programRegistryId).sort()).toEqual([1, 4]);

    expect(h.state.otRegistryBatches).toHaveLength(1);
    expect(h.state.otRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(h.state.otRegistryBatches[0]!.fileId).toBe('file_x');
    expect(h.state.otRegistryRecords).toHaveLength(2);

    expect(h.storagePut).toHaveBeenCalledTimes(1);
    expect(h.filesRegister).toHaveBeenCalledTimes(1);
    expect(h.auditWrite).toHaveBeenCalledTimes(1);
    expect(h.auditWrite.mock.calls[0]![0]).toMatchObject({
      action: 'regulatory.ot_registry_exported',
      entityType: 'ot_registry_batch'
    });
  });

  it('reports a snils error and writes no file when all rows are invalid', async () => {
    const h = makeHarness();
    // Single program + bad СНИЛС (checksum mismatch: computed digits are 95) → the only row is invalid.
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], snils: '112-233-445 96' });

    const outcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);

    expect(outcome.exported).toBe(0);
    expect(outcome.failed).toBeGreaterThanOrEqual(1);
    expect(outcome.fileId).toBeUndefined();
    expect(outcome.errors.some((e) => e.field === 'snils')).toBe(true);

    expect(h.state.otRegistryBatches).toHaveLength(1);
    expect(h.state.otRegistryBatches[0]!.batchStatus).toBe('failed');
    expect(h.state.otRegistryRecords).toHaveLength(0);
    expect(h.storagePut).not.toHaveBeenCalled();
    expect(h.filesRegister).not.toHaveBeenCalled();
  });

  it('FIX #1 — a throwing getter on one enrollment does not abort the batch; others still export', async () => {
    const h = makeHarness();
    // Good enrollment (enr_1) + a sibling (enr_bad) whose group lookup throws.
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });
    seedNamedCompletedEnrollment(h.state, {
      suffix: 'bad',
      programCodes: ['OT_A'],
      examPassed: true
    });

    // Make getGroup throw only for the bad enrollment's group; delegate otherwise.
    const realGetGroup = h.mvp.getGroup.bind(h.mvp);
    vi.spyOn(h.mvp, 'getGroup').mockImplementation((tenantId: string, groupId: string) => {
      if (groupId === 'grp_bad') {
        throw new NotFoundException({ code: 'group_not_found', message: 'dangling fk' });
      }
      return realGetGroup(tenantId, groupId);
    });

    // Must resolve (not reject) — partial success.
    const outcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);

    // The good enrollment still exports.
    expect(outcome.exported).toBe(1);
    expect(outcome.rows.map((r) => r.enrollmentId)).toEqual(['enr_1']);
    // The bad enrollment surfaces as an `enrollment`-field gather error.
    expect(outcome.failed).toBe(1);
    const gatherErr = outcome.errors.find((e) => e.enrollmentId === 'enr_bad');
    expect(gatherErr).toMatchObject({ enrollmentId: 'enr_bad', field: 'enrollment' });
    expect(outcome.total).toBe(2);

    // Batch was still created with a file for the valid row.
    expect(h.state.otRegistryBatches).toHaveLength(1);
    expect(h.state.otRegistryBatches[0]!.batchStatus).toBe('partial');
    expect(outcome.fileId).toBeTruthy();
  });

  it('FIX #2 — a non-passed enrollment is excluded from the file and reported as a result error', async () => {
    const h = makeHarness();
    // Sibling passed enrollment still exports.
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });
    // Non-passed: no exam result at all (examPassed: null → push nothing).
    seedNamedCompletedEnrollment(h.state, {
      suffix: 'np',
      programCodes: ['OT_A'],
      examPassed: null
    });

    const outcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);

    // Only the passed enrollment is in the file.
    expect(outcome.exported).toBe(1);
    expect(outcome.rows.map((r) => r.enrollmentId)).toEqual(['enr_1']);
    expect(h.state.otRegistryRecords.map((r) => r.enrollmentId)).toEqual(['enr_1']);

    // The non-passed enrollment is reported with field `result` and is NOT in rows.
    const resultErr = outcome.errors.find((e) => e.enrollmentId === 'enr_np');
    expect(resultErr).toMatchObject({ enrollmentId: 'enr_np', field: 'result' });
    expect(outcome.rows.some((r) => r.enrollmentId === 'enr_np')).toBe(false);
    expect(outcome.failed).toBe(1);
    expect(h.state.otRegistryBatches[0]!.batchStatus).toBe('partial');
  });

  it('FIX #2 — passed:false (explicit fail) is also excluded with a result error', async () => {
    const h = makeHarness();
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: false });

    const outcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);

    expect(outcome.exported).toBe(0);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]).toMatchObject({ enrollmentId: 'enr_1', field: 'result' });
    expect(outcome.fileId).toBeUndefined();
    expect(h.state.otRegistryBatches[0]!.batchStatus).toBe('failed');
  });

  it('FIX #3 — enrolledFrom/enrolledTo exclude out-of-range enrollments, include in-range', async () => {
    const h = makeHarness();
    // In range (enr_1 enrolledAt 2026-01-01) + out of range (enr_old 2025-06-01).
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });
    seedNamedCompletedEnrollment(h.state, {
      suffix: 'old',
      programCodes: ['OT_A'],
      examPassed: true,
      enrolledAt: '2025-06-01'
    });

    const outcome = await h.service.exportOtRegistry(
      TENANT,
      { enrolledFrom: '2026-01-01', enrolledTo: '2026-12-31' },
      ctx
    );

    // Only the in-range enrollment is exported; the out-of-range one is silently dropped
    // (not an error — it is simply out of the requested scope).
    expect(outcome.rows.map((r) => r.enrollmentId)).toEqual(['enr_1']);
    expect(outcome.exported).toBe(1);
    expect(outcome.errors.some((e) => e.enrollmentId === 'enr_old')).toBe(false);
    expect(outcome.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal 4-column response xlsx matching one OT_A record.
// Protocol 'ПР-12/2026', programRegistryId=1 (OT_A → registryId 1).
// ---------------------------------------------------------------------------
async function buildResponseBuffer(
  snils: string,
  protocolNumber: string,
  programRegistryId: number,
  regNo: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('resp');
  ws.addRow(['СНИЛС', 'Номер протокола', 'ID программы', 'Регистрационный номер']);
  ws.addRow([snils, protocolNumber, programRegistryId, regNo]);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

describe('OtRegistryService.importRegistryResponse', () => {
  it('stamps registrationNumber onto the matching record after export', async () => {
    const h = makeHarness();
    // Export a single-program enrollment so state.otRegistryRecords is populated.
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });
    const exportOutcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);
    expect(exportOutcome.exported).toBe(1);

    const [record] = h.state.otRegistryRecords;
    // The protocol number from the harness stub is 'ПР-12/2026'; OT_A → registryId 1.
    expect(record!.protocolNumber).toBe('ПР-12/2026');
    expect(record!.programRegistryId).toBe(1);
    const batchId = exportOutcome.batchId;

    const buf = await buildResponseBuffer(VALID_SNILS, 'ПР-12/2026', 1, 'РН-2026-001');
    const fileBase64 = buf.toString('base64');

    const importOutcome = await h.service.importRegistryResponse(TENANT, batchId, fileBase64, ctx);

    expect(importOutcome.matched).toBe(1);
    expect(importOutcome.unmatched).toBe(0);
    expect(h.state.otRegistryRecords[0]!.registrationNumber).toBe('РН-2026-001');

    // Audit was written twice: once for export, once for import.
    expect(h.auditWrite).toHaveBeenCalledTimes(2);
    expect(h.auditWrite.mock.calls[1]![0]).toMatchObject({
      action: 'regulatory.ot_registry_response_imported',
      entityType: 'ot_registry_batch',
      entityId: batchId,
      newValues: { matched: 1, unmatched: 0 }
    });
  });

  it('returns unmatched count when response row has no matching record', async () => {
    const h = makeHarness();
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });
    const exportOutcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);
    const batchId = exportOutcome.batchId;

    // Build a response with a СНИЛС that doesn't exist in records.
    const buf = await buildResponseBuffer('000-000-000 00', 'ПР-12/2026', 1, 'РН-999');
    const fileBase64 = buf.toString('base64');

    const importOutcome = await h.service.importRegistryResponse(TENANT, batchId, fileBase64, ctx);

    expect(importOutcome.matched).toBe(0);
    expect(importOutcome.unmatched).toBe(1);
    expect(h.state.otRegistryRecords[0]!.registrationNumber).toBeUndefined();
  });

  it('FIX #5 — a malformed (non-xlsx) response file rejects with BadRequestException, not 500', async () => {
    const h = makeHarness();
    seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });
    const exportOutcome = await h.service.exportOtRegistry(TENANT, noFilter, ctx);
    const batchId = exportOutcome.batchId;

    // Random bytes that are valid base64 but not a parseable .xlsx (ZIP) container.
    const garbage = Buffer.from('this-is-not-an-xlsx-file').toString('base64');

    await expect(
      h.service.importRegistryResponse(TENANT, batchId, garbage, ctx)
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
