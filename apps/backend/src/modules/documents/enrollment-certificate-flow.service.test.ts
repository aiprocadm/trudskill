import { describe, expect, it, vi } from 'vitest';

import { EnrollmentDocumentIssuanceListener } from './enrollment-document-issuance.listener.js';

describe('EnrollmentDocumentIssuanceListener (BL-007)', () => {
  it('вызывает generateDocument при успешном resolveAutoCertificateTemplateBinding', async () => {
    const generateDocument = vi.fn();
    const docs = {
      resolveAutoCertificateTemplateBinding: vi.fn(() => ({
        templateId: 'tmpl_cert',
        templateVersionId: 'tv_1'
      })),
      generateDocument
    };
    const runner = {
      runWithTenantDocuments: async (_tenantId: string, fn: (d: typeof docs) => Promise<void>) => {
        await fn(docs);
      }
    };
    const auditWrite = vi.fn();
    const listener = new EnrollmentDocumentIssuanceListener(
      runner as any,
      {
        write: auditWrite
      } as any
    );

    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enr_99',
      learnerId: 'lr_1',
      groupId: 'grp_1',
      groupCourseIds: ['course_a'],
      actorId: 'u_admin'
    });

    await new Promise<void>((resolve) => setImmediate(() => resolve()));

    expect(generateDocument).toHaveBeenCalledWith(
      'tenant_demo',
      'u_admin',
      expect.objectContaining({
        idempotencyKey: 'enrollment:enr_99:certificate:v1',
        templateId: 'tmpl_cert',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_99',
        documentType: 'certificate'
      }),
      undefined
    );
  });

  it('не генерирует документ если binding отсутствует', async () => {
    const generateDocument = vi.fn();
    const docs = {
      resolveAutoCertificateTemplateBinding: vi.fn(() => undefined),
      generateDocument
    };
    const runner = {
      runWithTenantDocuments: async (_tenantId: string, fn: (d: typeof docs) => Promise<void>) => {
        await fn(docs);
      }
    };
    const listener = new EnrollmentDocumentIssuanceListener(
      runner as any,
      {
        write: vi.fn()
      } as any
    );

    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enr_100',
      learnerId: 'lr_1',
      groupId: 'grp_2',
      groupCourseIds: [],
      actorId: 'u_admin'
    });

    await new Promise<void>((resolve) => setImmediate(() => resolve()));

    expect(generateDocument).not.toHaveBeenCalled();
  });
});
