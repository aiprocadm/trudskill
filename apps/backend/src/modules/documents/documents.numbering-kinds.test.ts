import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { numberClaimKey } from './infrastructure/issued-number-claims.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_tenant_admin'
} as RequestContext;

const makeService = () => {
  const audit = new AuditService();
  return {
    audit,
    service: new DocumentsService(new InMemoryDocumentsState(), audit, new RealtimeEventsService())
  };
};

/**
 * МГ-F3.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 19.1, РМ125): номер уникален в пределах вида.
 * «Номер приказа = код группы» и «номер протокола = код группы» дают один номер двум видам —
 * это законно; два протокола с одним номером — нет.
 */
describe('нумерация по видам документов (МГ-F3.1, срез 19.1)', () => {
  it('у двух видов один номер разрешён, дубль внутри вида — отказ', () => {
    const { service } = makeService();
    service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      prefix: '264501',
      pattern: '{prefix}'
    });
    service.createNumberingRule(T, {
      documentType: 'protocol',
      kindCode: 'protocol.knowledge_check',
      prefix: '264501',
      pattern: '{prefix}'
    });

    const order = service.reserveNumber(T, 'order', 'order.enrollment');
    const protocol = service.reserveNumber(T, 'protocol', 'protocol.knowledge_check');
    expect(order.reservedNumber).toBe('264501');
    expect(protocol.reservedNumber).toBe('264501');
    expect(order.kindCode).toBe('order.enrollment');
    expect(protocol.kindCode).toBe('protocol.knowledge_check');

    expect(() => service.reserveNumber(T, 'protocol', 'protocol.knowledge_check')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_number_taken' })
      })
    );
  });

  it('документ без вида правилом вида не нумеруется; вид без своего правила берёт правило типа', () => {
    const { service } = makeService();
    service.createNumberingRule(T, { documentType: 'order', prefix: 'ПР-' });
    service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      prefix: 'З-'
    });

    expect(service.reserveNumber(T, 'order').reservedNumber).toBe('ПР-000001');
    expect(service.reserveNumber(T, 'order', 'order.enrollment').reservedNumber).toBe('З-000001');
    // «Приказ об окончании» своего правила не имеет — общий счётчик приказов (РМ124).
    const completion = service.reserveNumber(T, 'order', 'order.completion');
    expect(completion.reservedNumber).toBe('ПР-000002');
    expect(completion.kindCode).toBeUndefined();
  });

  it('правило вида выключает только прежнее правило того же вида', () => {
    const { service } = makeService();
    const typeRule = service.createNumberingRule(T, { documentType: 'order', prefix: 'ПР-' });
    const first = service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      prefix: 'З-'
    });
    const second = service.createNumberingRule(T, {
      documentType: 'order',
      kindCode: 'order.enrollment',
      prefix: 'ЗЧ-'
    });
    const rules = service.listNumberingRules(T, {}).items;
    const active = (id: string) => rules.find((r) => r.id === id)?.isActive;
    expect(active(typeRule.id)).toBe(true);
    expect(active(first.id)).toBe(false);
    expect(active(second.id)).toBe(true);

    service.activateNumberingRule(T, ctx.userId, first.id, ctx);
    const after = service.listNumberingRules(T, {}).items;
    expect(after.find((r) => r.id === typeRule.id)?.isActive).toBe(true);
    expect(after.find((r) => r.id === second.id)?.isActive).toBe(false);
  });

  it('вид обязан относиться к типу правила', () => {
    const { service } = makeService();
    expect(() =>
      service.createNumberingRule(T, { documentType: 'certificate', kindCode: 'order.enrollment' })
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_kind_template_mismatch' })
      })
    );
    expect(() =>
      service.createNumberingRule(T, { documentType: 'order', kindCode: 'order.unknown' })
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'document_kind_unknown' })
      })
    );
  });

  it('создание и правка правила попадают в журнал действий', async () => {
    const { service, audit } = makeService();
    const rule = service.createNumberingRule(
      T,
      { documentType: 'order', kindCode: 'order.enrollment', prefix: 'З-' },
      ctx.userId,
      ctx
    );
    service.updateNumberingRule(T, rule.id, { startCounter: 137 }, ctx.userId, ctx);
    const events = await audit.list(T);
    const created = events.find((e) => e.action === 'documents.numbering_rule_created');
    const updated = events.find((e) => e.action === 'documents.numbering_rule_updated');
    expect(created?.entityId).toBe(rule.id);
    expect(created?.newValues).toMatchObject({ kindCode: 'order.enrollment', prefix: 'З-' });
    expect(updated?.oldValues).toMatchObject({ currentCounter: 0 });
    expect(updated?.newValues).toMatchObject({ currentCounter: 136 });
  });

  it('ключ заявки номера в базе: с видом — «вид␟номер», без вида — номер как раньше', () => {
    expect(numberClaimKey({ reservedNumber: 'CERT-000001' })).toBe('CERT-000001');
    expect(numberClaimKey({ reservedNumber: '264501', kindCode: 'order.enrollment' })).toBe(
      'order.enrollment␟264501'
    );
    expect(numberClaimKey({ reservedNumber: '264501', kindCode: 'order.enrollment' })).not.toBe(
      numberClaimKey({ reservedNumber: '264501', kindCode: 'protocol.knowledge_check' })
    );
  });
});
