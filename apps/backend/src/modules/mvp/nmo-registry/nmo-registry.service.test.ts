import { describe, expect, it, vi } from 'vitest';

import { NmoRegistryService } from './nmo-registry.service.js';
import { NmoXlsxWriter } from './nmo-xlsx.writer.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

const ctx = {
  tenantId: 't1',
  userId: 'u1',
  requestId: 'r',
  correlationId: 'c',
  ip: '',
  userAgent: ''
} as any;

function makeService(docOver: Record<string, unknown> = {}, opts: { courseTitle?: string } = {}) {
  const state = new InMemoryMvpState();
  const doc = {
    id: 'd1',
    documentNumber: 'НМО-7',
    documentDate: '2026-04-20',
    documentType: 'certificate',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'e1',
    status: 'final',
    ...docOver
  };
  const documents = { listIssuedDocuments: vi.fn().mockReturnValue({ items: [doc] }) } as any;
  const mvp = {
    getEnrollment: vi
      .fn()
      .mockReturnValue({ id: 'e1', tenantId: 't1', learnerId: 'l1', groupId: 'g1' }),
    getLearner: vi.fn().mockReturnValue({
      id: 'l1',
      tenantId: 't1',
      lastName: 'Петрова',
      firstName: 'Анна',
      snils: '112-233-445 95'
    }),
    getGroup: vi.fn().mockReturnValue({ id: 'g1', tenantId: 't1', counterpartyId: 'cp1' }),
    listGroupCourses: vi
      .fn()
      .mockReturnValue({ items: [{ courseId: 'co1', courseVersionId: 'cv1' }] }),
    getCourse: vi.fn().mockReturnValue({
      id: 'co1',
      title: 'courseTitle' in opts ? opts.courseTitle : 'Кардиология'
    }),
    getCourseVersion: vi.fn().mockReturnValue({ id: 'cv1', academicHours: 36 })
  } as any;
  const files = {
    register: vi.fn().mockResolvedValue({ id: 'file1' }),
    createDownloadUrl: vi.fn().mockResolvedValue('http://x')
  } as any;
  const storage = { putObject: vi.fn().mockResolvedValue(undefined) } as any;
  const audit = { write: vi.fn() } as any;
  const service = new NmoRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new NmoXlsxWriter(),
    audit
  );
  return { service, state, files };
}

describe('NmoRegistryService', () => {
  it('exports an issued document → one row with ЗЕТ from academicHours, batch generated', async () => {
    const { service, state, files } = makeService();
    const outcome = await service.exportNmoRegistry('t1', {}, ctx);
    expect(outcome.exported).toBe(1);
    expect(outcome.rows[0]!.creditUnits).toBe('36');
    expect(outcome.rows[0]!.programName).toBe('Кардиология');
    expect(files.register).toHaveBeenCalledOnce();
    expect(state.nmoRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(state.nmoRegistryRecords).toHaveLength(1);
  });

  it('skips non-enrollment-sourced documents', async () => {
    const { service } = makeService({ sourceEntityType: 'group' });
    const outcome = await service.exportNmoRegistry('t1', {}, ctx);
    expect(outcome.total).toBe(0);
  });

  it('listBatches + getBatchWithRecords + download url', async () => {
    const { service } = makeService();
    const { batchId } = await service.exportNmoRegistry('t1', {}, ctx);
    expect(service.listBatches('t1')).toHaveLength(1);
    expect(service.getBatchWithRecords('t1', batchId).records).toHaveLength(1);
    await expect(service.getBatchDownloadUrl('t1', batchId)).resolves.toEqual({ url: 'http://x' });
  });

  it('rejects cross-tenant batch access', async () => {
    const { service } = makeService();
    const { batchId } = await service.exportNmoRegistry('t1', {}, ctx);
    expect(() => service.getBatchWithRecords('t2', batchId)).toThrow();
    await expect(service.getBatchDownloadUrl('t2', batchId)).rejects.toThrow();
  });

  it('dedups failed count when one document fails preflight on multiple fields', async () => {
    // Enrollment-sourced document (not a gather-error), but empty documentNumber → empty
    // documentNumber row AND empty course title → empty programName. One document, two
    // preflight errors sharing the same documentId.
    const { service } = makeService({ documentNumber: '' }, { courseTitle: '' });
    const outcome = await service.exportNmoRegistry('t1', {}, ctx);

    const dErrors = outcome.errors.filter((e) => e.documentId === 'd1');
    expect(dErrors.length).toBeGreaterThanOrEqual(2);
    const fields = dErrors.map((e) => e.field);
    expect(fields).toContain('documentNumber');
    expect(fields).toContain('programName');

    // `failed` counts DISTINCT failed documents, not per-field error objects.
    expect(outcome.failed).toBe(1);
    expect(outcome.exported).toBe(0);
  });
});
