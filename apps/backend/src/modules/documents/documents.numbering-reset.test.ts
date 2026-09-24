import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';

import type { RequestContext } from '../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_tenant_admin'
} as RequestContext;

const make = () => {
  const audit = new AuditService();
  const service = new DocumentsService(
    new InMemoryDocumentsState(),
    audit,
    new RealtimeEventsService()
  );
  return { audit, service };
};

/**
 * МГ-F3.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 19.3): «сбросить счётчики» — только
 * администратор, с вводом подтверждения и аудитом.
 */
describe('сброс счётчика нумерации (МГ-F3.1, срез 19.3)', () => {
  it('без верного подтверждения — отказ, счётчик не трогается', () => {
    const { service } = make();
    const rule = service.createNumberingRule(T, { documentType: 'order', startCounter: 138 });
    expect(() =>
      service.resetNumberingRule(
        T,
        ctx.userId,
        rule.id,
        { confirmation: '1', startCounter: 1 },
        ctx
      )
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'numbering_reset_confirmation_mismatch' })
      })
    );
    expect(service.getNumberingRule(T, rule.id).currentCounter).toBe(137);
  });

  it('сброс назад разрешён и пишется в журнал; совпавший номер всё равно не выдаётся дважды', async () => {
    const { service, audit } = make();
    const rule = service.createNumberingRule(T, { documentType: 'order', prefix: 'ПР-' });
    expect(service.reserveNumber(T, 'order').reservedNumber).toBe('ПР-000001');
    expect(service.reserveNumber(T, 'order').reservedNumber).toBe('ПР-000002');

    service.resetNumberingRule(
      T,
      ctx.userId,
      rule.id,
      { confirmation: ' 2 ', startCounter: 1 },
      ctx
    );
    expect(service.getNumberingRule(T, rule.id).currentCounter).toBe(0);
    // ПР-000001 уже выдан — дубля нет, выдача отказывает.
    expect(() => service.reserveNumber(T, 'order')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_number_taken' })
      })
    );

    const events = await audit.list(T);
    const reset = events.find((e) => e.action === 'documents.numbering_rule_reset');
    expect(reset?.entityId).toBe(rule.id);
    expect(reset?.oldValues).toMatchObject({ currentCounter: 2 });
    expect(reset?.newValues).toMatchObject({ currentCounter: 0 });
  });

  it('ручка сброса требует и права на документы, и права настроек центра (только администратор)', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      DocumentsController.prototype.resetRule
    ) as string[];
    expect(required).toEqual(expect.arrayContaining(['documents.write', 'tenant.settings.write']));
    const preview = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      DocumentsController.prototype.previewRule
    ) as string[];
    expect(preview).toEqual(['documents.read']);
  });
});
