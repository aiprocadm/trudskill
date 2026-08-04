import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RentalBillingService } from './rental-billing.service.js';
import { addWorkingDays } from './rental-billing.util.js';

import type { RequestContext } from '../../common/context/request-context.js';

const context = { requestId: 'r1', correlationId: 'c1' } as RequestContext;

const invoiceRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rinv_1',
  tenantId: 't1',
  planId: 'plan_basic',
  number: 'СЧ-1',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  amountKopecks: '1500000',
  currency: 'RUB',
  status: 'issued',
  dueAt: '2026-08-10',
  issuedAt: '2026-08-01T00:00:00.000Z',
  paidAt: null,
  providerCode: 'manual',
  ...overrides
});

function make(
  queryImpl: (sql: string, params?: unknown[]) => Promise<unknown[]>,
  providers?: Map<string, unknown>
) {
  const query = vi.fn(queryImpl);
  const audit = { writeCritical: vi.fn().mockResolvedValue({}) };
  const service = new RentalBillingService(
    { query } as never,
    audit as never,
    (providers ?? new Map()) as never
  );
  return { service, query, audit };
}

describe('RentalBillingService (ФТ-D5.1)', () => {
  it('listInvoices нормализует bigint-строку копеек в число', async () => {
    const { service } = make(async () => [invoiceRow()]);
    const [invoice] = await service.listInvoices('t1');
    expect(invoice!.amountKopecks).toBe(1_500_000);
    expect(typeof invoice!.amountKopecks).toBe('number');
  });

  it('issueInvoice: занятый номер — 409, счёт не создаётся', async () => {
    const { service, query } = make(async (sql) => {
      if (sql.includes('from core.tenants')) return [{ id: 't1', name: 'УЦ' }];
      if (sql.includes('where number = $1')) return [{ id: 'rinv_old' }];
      throw new Error(`unexpected: ${sql}`);
    });
    await expect(
      service.issueInvoice(
        'u1',
        {
          tenantId: 't1',
          number: 'СЧ-1',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          amountKopecks: 100
        },
        context
      )
    ).rejects.toMatchObject({ constructor: ConflictException });
    expect(query.mock.calls.some(([sql]) => (sql as string).startsWith('insert'))).toBe(false);
  });

  it('issueInvoice: без явного срока ставит срок в рабочих днях и печатает счёт адаптером', async () => {
    const inserted: unknown[][] = [];
    const providerIssue = vi.fn().mockResolvedValue({
      document: {
        fileName: 'invoice-СЧ-2.pdf',
        contentType: 'application/pdf',
        content: Buffer.from('%PDF')
      }
    });
    const { service, audit } = make(
      async (sql, params) => {
        if (sql.includes('from core.tenants')) return [{ id: 't1', name: 'УЦ «Пример»' }];
        if (sql.includes('where number = $1')) return [];
        if (sql.includes('join core.tenant_subscriptions'))
          return [{ id: 'plan_basic', name: 'Базовый' }];
        if (sql.trimStart().startsWith('insert')) {
          inserted.push(params!);
          return [];
        }
        return [invoiceRow({ number: 'СЧ-2' })];
      },
      new Map([['manual', { code: 'manual', issue: providerIssue }]])
    );

    const result = await service.issueInvoice(
      'u1',
      {
        tenantId: 't1',
        number: 'СЧ-2',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        amountKopecks: 1_500_000
      },
      context
    );

    expect(result.document?.fileName).toBe('invoice-СЧ-2.pdf');
    // dueAt (9-й параметр insert) — валидная дата, посчитанная в рабочих днях.
    const dueAt = inserted[0]![8] as string;
    expect(dueAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${dueAt}T00:00:00Z`).getUTCDay()).not.toBe(0);
    expect(new Date(`${dueAt}T00:00:00Z`).getUTCDay()).not.toBe(6);
    // Имя тарифа уходит в печатную форму.
    expect(providerIssue.mock.calls[0]![0]).toMatchObject({
      planName: 'Базовый',
      tenantName: 'УЦ «Пример»'
    });
    expect(audit.writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.rental_invoice_issued', tenantId: 't1' })
    );
  });

  it('issueInvoice: сбой печати не отменяет счёт', async () => {
    const { service } = make(
      async (sql) => {
        if (sql.includes('from core.tenants')) return [{ id: 't1', name: 'УЦ' }];
        if (sql.includes('where number = $1')) return [];
        if (sql.includes('join core.tenant_subscriptions')) return [];
        if (sql.trimStart().startsWith('insert')) return [];
        return [invoiceRow()];
      },
      // Адаптер вернул null (Gotenberg недоступен) — счёт всё равно выставлен.
      new Map([['manual', { code: 'manual', issue: async () => null }]])
    );
    const result = await service.issueInvoice(
      'u1',
      {
        tenantId: 't1',
        number: 'СЧ-3',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        amountKopecks: 1
      },
      context
    );
    expect(result.invoice.status).toBe('issued');
    expect(result.document).toBeUndefined();
  });

  it('markPaid идемпотентен и не трогает отменённый счёт', async () => {
    const paid = make(async () => [invoiceRow({ status: 'paid', paidAt: '2026-08-05T00:00:00Z' })]);
    await paid.service.markPaid('u1', 'rinv_1', context);
    expect(paid.query.mock.calls.some(([sql]) => (sql as string).includes('update'))).toBe(false);

    const cancelled = make(async () => [invoiceRow({ status: 'cancelled' })]);
    await expect(cancelled.service.markPaid('u1', 'rinv_1', context)).rejects.toMatchObject({
      constructor: ConflictException
    });

    const missing = make(async () => []);
    await expect(missing.service.markPaid('u1', 'rinv_x', context)).rejects.toMatchObject({
      constructor: NotFoundException
    });
  });
});

describe('RentalBillingService.suspendOverdueTenants (ФТ-D5.1 — ключевой сценарий)', () => {
  const overdueRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'rinv_1',
    tenantId: 't1',
    number: 'СЧ-1',
    dueAt: '2026-08-04',
    graceWorkingDays: 10,
    ...overrides
  });

  it('неоплата дольше grace → тенант приостановлен, событие в аудите', async () => {
    const updates: unknown[][] = [];
    const { service, audit } = make(async (sql, params) => {
      if (sql.includes('from core.rental_invoices')) return [overdueRow()];
      updates.push(params!);
      return [];
    });
    // Последний день grace — 2026-08-18; берём следующий.
    const suspended = await service.suspendOverdueTenants('2026-08-19');
    expect(suspended).toEqual([{ tenantId: 't1', invoiceNumber: 'СЧ-1' }]);
    expect(updates[0]).toEqual(['t1']);
    expect(audit.writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.tenant_suspended_for_nonpayment' })
    );
  });

  it('оплата в срок → тенант не трогается (оплаченные счета не выбираются вовсе)', async () => {
    const { service, query, audit } = make(async (sql) => {
      if (sql.includes('from core.rental_invoices')) {
        // Выборка идёт только по status='issued' — оплаченный счёт сюда не попадает.
        expect(sql).toContain("i.status = 'issued'");
        return [];
      }
      return [];
    });
    const suspended = await service.suspendOverdueTenants('2026-08-19');
    expect(suspended).toEqual([]);
    expect(query.mock.calls.some(([sql]) => (sql as string).includes('update core.tenants'))).toBe(
      false
    );
    expect(audit.writeCritical).not.toHaveBeenCalled();
  });

  it('внутри grace тенант продолжает работать', async () => {
    const { service } = make(async (sql) =>
      sql.includes('from core.rental_invoices') ? [overdueRow()] : []
    );
    const lastDay = addWorkingDays('2026-08-04', 10);
    await expect(service.suspendOverdueTenants(lastDay)).resolves.toEqual([]);
  });

  it('счёт без тарифа использует дефолтный grace схемы (10 рабочих дней)', async () => {
    const { service } = make(async (sql) =>
      sql.includes('from core.rental_invoices') ? [overdueRow({ graceWorkingDays: null })] : []
    );
    await expect(service.suspendOverdueTenants('2026-08-18')).resolves.toEqual([]);
    await expect(service.suspendOverdueTenants('2026-08-19')).resolves.toHaveLength(1);
  });

  it('приостанавливаются только активные и пробные — не архив и не уже приостановленные', async () => {
    const { service } = make(async (sql) => {
      if (sql.includes('from core.rental_invoices')) {
        expect(sql).toContain("t.status in ('active', 'trial')");
        return [];
      }
      return [];
    });
    await service.suspendOverdueTenants('2026-08-19');
  });
});
