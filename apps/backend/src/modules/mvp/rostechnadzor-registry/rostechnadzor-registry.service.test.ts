import { describe, expect, it, vi } from 'vitest';

import { RostechnadzorRegistryService } from './rostechnadzor-registry.service.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-xlsx.writer.js';
import { FakeExportSignatureProvider } from '../../../infrastructure/export-signature/fake-export-signature.provider.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { ExportSignatureProvider } from '../../../infrastructure/export-signature/export-signature.provider.js';

const ctx = {
  tenantId: 't1',
  userId: 'u1',
  requestId: 'r',
  correlationId: 'c',
  ip: '',
  userAgent: ''
} as any;

function makeService(
  overrides: { passed?: boolean; courseTitle?: string; protocolItems?: unknown[] } = {},
  exportSigner?: ExportSignatureProvider
) {
  const state = new InMemoryMvpState();
  const learner = {
    id: 'l1',
    tenantId: 't1',
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Петрович',
    snils: '112-233-445 95',
    position: 'Инженер'
  };
  const group = { id: 'g1', tenantId: 't1', counterpartyId: 'cp1' };
  const enrollment = {
    id: 'e1',
    tenantId: 't1',
    learnerId: 'l1',
    groupId: 'g1',
    status: 'completed',
    enrolledAt: '2026-05-01'
  };
  const mvp = {
    listEnrollments: vi.fn().mockReturnValue({ items: [enrollment] }),
    getLearner: vi.fn().mockReturnValue(learner),
    getGroup: vi.fn().mockReturnValue(group),
    getCounterparty: vi.fn().mockReturnValue({ id: 'cp1', name: 'ООО Ромашка', inn: '7701234567' }),
    listGroupCourses: vi
      .fn()
      .mockReturnValue({ items: [{ courseId: 'co1', courseVersionId: 'cv1' }] }),
    getCourse: vi
      .fn()
      .mockReturnValue(
        'courseTitle' in overrides
          ? { id: 'co1', title: overrides.courseTitle }
          : { id: 'co1', title: 'Б.1 Эксплуатация ОПО' }
      ),
    getExamResultByEnrollment: vi.fn().mockReturnValue([{ passed: overrides.passed ?? true }])
  } as any;
  const documents = {
    listDocuments: vi.fn().mockReturnValue({
      items: overrides.protocolItems ?? [{ documentNumber: 'ПБ-42', documentDate: '2026-05-10' }]
    })
  } as any;
  const files = {
    register: vi.fn().mockResolvedValue({ id: 'file1' }),
    createDownloadUrl: vi.fn().mockResolvedValue('http://x')
  } as any;
  const storage = { putObject: vi.fn().mockResolvedValue(undefined) } as any;
  const audit = { write: vi.fn() } as any;
  const service = new RostechnadzorRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new RostechnadzorXlsxWriter(),
    audit,
    exportSigner
  );
  return { service, state, files, storage };
}

describe('RostechnadzorRegistryService', () => {
  it('exports a passed enrollment → one row, file stored, batch generated', async () => {
    const { service, state, files, storage } = makeService();
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(outcome.exported).toBe(1);
    expect(outcome.failed).toBe(0);
    expect(outcome.rows[0]!.attestationArea).toBe('Б.1 Эксплуатация ОПО');
    expect(files.register).toHaveBeenCalledOnce();
    expect(storage.putObject).toHaveBeenCalledOnce();
    expect(state.rostechnadzorRegistryBatches).toHaveLength(1);
    expect(state.rostechnadzorRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(state.rostechnadzorRegistryRecords).toHaveLength(1);
  });

  it('non-passed enrollment → failed gather-error, no file', async () => {
    const { service, state, files } = makeService({ passed: false });
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(outcome.exported).toBe(0);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]!.field).toBe('result');
    expect(files.register).not.toHaveBeenCalled();
    expect(state.rostechnadzorRegistryBatches[0]!.batchStatus).toBe('failed');
  });

  it('listBatches returns tenant batches; getBatchWithRecords + getBatchDownloadUrl work', async () => {
    const { service } = makeService();
    const { batchId } = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(service.listBatches('t1')).toHaveLength(1);
    expect(service.getBatchWithRecords('t1', batchId).records).toHaveLength(1);
    await expect(service.getBatchDownloadUrl('t1', batchId)).resolves.toEqual({ url: 'http://x' });
  });

  it('rejects cross-tenant batch access', async () => {
    const { service } = makeService();
    const { batchId } = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(() => service.getBatchWithRecords('t2', batchId)).toThrow();
    await expect(service.getBatchDownloadUrl('t2', batchId)).rejects.toThrow();
  });

  it('dedups failed count when one enrollment fails preflight on multiple fields', async () => {
    // Passed exam (not a gather-error), but empty course title → empty attestationArea
    // AND no protocol document → empty protocolNumber. One enrollment, two preflight errors.
    const { service } = makeService({ courseTitle: '', protocolItems: [] });
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);

    const e1Errors = outcome.errors.filter((e) => e.enrollmentId === 'e1');
    expect(e1Errors.length).toBeGreaterThanOrEqual(2);
    const fields = e1Errors.map((e) => e.field);
    expect(fields).toContain('attestationArea');
    expect(fields).toContain('protocolNumber');

    // `failed` counts DISTINCT failed enrollments, not per-field error objects.
    expect(outcome.failed).toBe(1);
    expect(outcome.exported).toBe(0);
  });

  it('stamps the batch with a КЭП signature when an export signer is active', async () => {
    const { service, state } = makeService({}, new FakeExportSignatureProvider('УЦ'));
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);

    expect(outcome.exported).toBeGreaterThan(0);
    const batch = state.rostechnadzorRegistryBatches[0]!;
    expect(batch.signatureStatus).toBe('signed');
    expect(batch.signatureFileId).toBeTruthy();
    expect(batch.signatureCertificateSubject).toContain('УЦ');
    expect(outcome.signatureStatus).toBe('signed');
  });

  it('leaves the batch unsigned when no export signer is configured', async () => {
    const { service, state } = makeService();
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);

    const batch = state.rostechnadzorRegistryBatches[0]!;
    expect(batch.signatureStatus).toBe('unsigned');
    expect(batch.signatureFileId).toBeUndefined();
    expect(outcome.signatureStatus).toBe('unsigned');
    expect(outcome.signatureFileId).toBeUndefined();
  });
});
