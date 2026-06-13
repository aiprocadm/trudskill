import { EventEmitter2 } from '@nestjs/event-emitter';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { Counterparty, Enrollment, GroupEntity, Learner } from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;
const noopFilesService = { ensureMaterialLink: async () => undefined } as unknown as FilesService;

const T = 'tenant_a';
const OTHER = 'tenant_b';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeService() {
  const state = new InMemoryMvpState();
  const audit = new AuditService();
  vi.spyOn(audit, 'write').mockImplementation(() => undefined);
  const service = new MvpService(
    state,
    new TenantScopedRepository(),
    audit,
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  return { state, audit, service };
}

const base = (tenantId: string, id: string) => ({
  id,
  tenantId,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
});

function seed(state: InMemoryMvpState): void {
  state.counterparties.push({
    ...base(T, 'cp1'),
    code: 'CP1',
    name: 'ООО Ромашка'
  } as Counterparty);
  state.groups.push({
    ...base(T, 'g1'),
    code: 'G1',
    name: 'Группа А',
    counterpartyId: 'cp1'
  } as GroupEntity);
  state.learners.push({
    ...base(T, 'l1'),
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович'
  } as Learner);
  state.learners.push({ ...base(T, 'l2'), lastName: 'Петров', firstName: 'Пётр' } as Learner);
  state.learners.push({ ...base(OTHER, 'l9'), lastName: 'Чужой', firstName: 'Икс' } as Learner);
  state.enrollments.push({
    ...base(T, 'e1'),
    groupId: 'g1',
    learnerId: 'l1',
    enrolledAt: '2026-02-01T00:00:00.000Z'
  } as Enrollment);
  state.enrollments.push({
    ...base(T, 'e2'),
    groupId: 'g1',
    learnerId: 'l2',
    status: 'completed',
    enrolledAt: '2026-03-01T00:00:00.000Z'
  } as Enrollment);
  state.enrollments.push({
    ...base(OTHER, 'e9'),
    groupId: 'g1',
    learnerId: 'l9',
    enrolledAt: '2026-02-01T00:00:00.000Z'
  } as Enrollment);
}

describe('MvpService report builder', () => {
  it('getReportEntitiesMeta returns the two v1 entities with fields and filters', () => {
    const { service } = makeService();
    const meta = service.getReportEntitiesMeta();
    expect(meta.entities.map((e) => e.key).sort()).toEqual(['enrollments', 'learners']);
    const enr = meta.entities.find((e) => e.key === 'enrollments')!;
    expect(enr.fields.some((f) => f.key === 'learnerName')).toBe(true);
    expect(enr.filters.some((f) => f.key === 'client')).toBe(true);
  });

  it('previewReport scopes to the tenant and resolves attached fields', () => {
    const { state, service } = makeService();
    seed(state);
    const out = service.previewReport(T, {
      entityKey: 'enrollments',
      selectedFields: ['learnerName', 'groupName', 'clientName', 'status']
    });
    expect(out.total).toBe(2); // tenant_b's e9 excluded
    expect(out.rows).toContainEqual({
      learnerName: 'Иванов Иван Иванович',
      groupName: 'Группа А',
      clientName: 'ООО Ромашка',
      status: 'active'
    });
    expect(out.truncated).toBe(false);
  });

  it('previewReport applies filters', () => {
    const { state, service } = makeService();
    seed(state);
    const out = service.previewReport(T, {
      entityKey: 'enrollments',
      selectedFields: ['learnerName'],
      filters: [{ key: 'status', value: 'completed' }]
    });
    expect(out.rows).toEqual([{ learnerName: 'Петров Пётр' }]);
  });

  it('previewReport caps at 50 rows and marks truncated', () => {
    const { state, service } = makeService();
    for (let i = 0; i < 60; i++) {
      state.learners.push({ ...base(T, `lx${i}`), lastName: `Ф${i}`, firstName: 'И' } as Learner);
    }
    const out = service.previewReport(T, { entityKey: 'learners', selectedFields: ['fullName'] });
    expect(out.rows).toHaveLength(50);
    expect(out.total).toBe(60);
    expect(out.truncated).toBe(true);
  });

  it('previewReport throws a validation error on empty selectedFields', () => {
    const { service } = makeService();
    expect(() => service.previewReport(T, { entityKey: 'learners', selectedFields: [] })).toThrow(
      /validation_error|no_fields_selected/
    );
  });

  it('exportReport returns a loadable xlsx as base64-in-envelope', async () => {
    const { state, service } = makeService();
    seed(state);
    const out = await service.exportReport(T, {
      entityKey: 'enrollments',
      selectedFields: ['learnerName', 'status']
    });
    expect(out.fileName.endsWith('.xlsx')).toBe(true);
    expect(out.mimeType).toContain('spreadsheetml');
    expect(out.contentBase64.length).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(out.contentBase64, 'base64') as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.getRow(1).getCell(1).value).toBe('Ученик');
  });

  it('saveReportTemplate creates then updates by id; list/delete are tenant-scoped + audited', () => {
    const { service, audit } = makeService();
    const created = service.saveReportTemplate(
      T,
      { name: 'Активные', entityKey: 'enrollments', selectedFields: ['learnerName', 'status'] },
      ctx
    );
    expect(created.id).toBeTruthy();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reports.template_created' })
    );

    const updated = service.saveReportTemplate(
      T,
      {
        id: created.id,
        name: 'Активные v2',
        entityKey: 'enrollments',
        selectedFields: ['learnerName']
      },
      ctx
    );
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Активные v2');
    expect(service.listReportTemplates(T)).toHaveLength(1); // update in place, not append
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reports.template_updated' })
    );

    service.deleteReportTemplate(T, created.id, ctx);
    expect(service.listReportTemplates(T)).toHaveLength(0);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reports.template_deleted' })
    );
  });

  it('templates are isolated across tenants', () => {
    const { service } = makeService();
    const created = service.saveReportTemplate(
      T,
      { name: 'X', entityKey: 'learners', selectedFields: ['fullName'] },
      ctx
    );
    expect(service.listReportTemplates(OTHER)).toHaveLength(0);
    expect(() => service.deleteReportTemplate(OTHER, created.id, ctx)).toThrow(/not found/i);
  });
});
