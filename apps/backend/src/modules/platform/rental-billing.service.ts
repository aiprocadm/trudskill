import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';

import { addWorkingDays, isGraceExpired } from './rental-billing.util.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  RENTAL_BILLING_PROVIDER_REGISTRY,
  type RentalBillingProviderCode,
  type RentalBillingProviderRegistry,
  type RentalInvoiceIssueResult
} from '../../infrastructure/rental-billing/rental-billing.provider.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ФТ-D5.1 (Фаза 4 Task 6): счета аренды и приостановка за неоплату.
 *
 * Платформенный уровень, отдельно от `payments` (D5.3). Выставление и отметка оплаты —
 * под `platform.tenants.write`; арендатор видит СВОИ счета правом `tenant.usage.read`
 * (это его же биллинговая картина, что и «Использование»).
 */

export type RentalInvoiceStatus = 'issued' | 'paid' | 'cancelled';

export interface RentalInvoice {
  id: string;
  tenantId: string;
  planId: string | null;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountKopecks: number;
  currency: string;
  status: RentalInvoiceStatus;
  dueAt: string;
  issuedAt: string;
  paidAt: string | null;
  providerCode: RentalBillingProviderCode;
}

const INVOICE_COLUMNS = `id, tenant_id as "tenantId", plan_id as "planId", number,
  period_start::text as "periodStart", period_end::text as "periodEnd",
  amount_kopecks as "amountKopecks", currency, status,
  due_at::text as "dueAt", issued_at as "issuedAt", paid_at as "paidAt",
  provider_code as "providerCode"`;

/** pg отдаёт bigint строкой — та же грабля, что с лимитами тарифа (§5.232). */
const normalizeInvoice = (row: RentalInvoice): RentalInvoice => ({
  ...row,
  amountKopecks: Number(row.amountKopecks)
});

@Injectable()
export class RentalBillingService {
  private readonly logger = new Logger(RentalBillingService.name);

  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional()
    @Inject(RENTAL_BILLING_PROVIDER_REGISTRY)
    private readonly providers: RentalBillingProviderRegistry | undefined
  ) {}

  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'billing_store_unavailable',
        message: 'Billing store is unavailable'
      });
    }
    return this.databaseService;
  }

  async listInvoices(tenantId?: string): Promise<RentalInvoice[]> {
    const rows = tenantId
      ? await this.requireDb().query<RentalInvoice>(
          `select ${INVOICE_COLUMNS} from core.rental_invoices where tenant_id = $1
           order by issued_at desc`,
          [tenantId]
        )
      : await this.requireDb().query<RentalInvoice>(
          `select ${INVOICE_COLUMNS} from core.rental_invoices order by issued_at desc limit 200`
        );
    return rows.map(normalizeInvoice);
  }

  /**
   * Выставление счёта. Номер задаётся платформой явно: бухгалтерия ведёт свою нумерацию,
   * и наша «умная» маска здесь только мешала бы сверке.
   */
  async issueInvoice(
    actorId: string | undefined,
    input: {
      tenantId: string;
      number: string;
      periodStart: string;
      periodEnd: string;
      amountKopecks: number;
      dueAt?: string;
      currency?: string;
      providerCode?: RentalBillingProviderCode;
    },
    context: RequestContext
  ): Promise<{ invoice: RentalInvoice; document?: RentalInvoiceIssueResult['document'] }> {
    const db = this.requireDb();
    const tenants = await db.query<{ id: string; name: string }>(
      'select id, name from core.tenants where id = $1',
      [input.tenantId]
    );
    const tenant = tenants[0];
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }
    const duplicates = await db.query<{ id: string }>(
      'select id from core.rental_invoices where number = $1',
      [input.number]
    );
    if (duplicates.length > 0) {
      throw new ConflictException({
        code: 'invoice_number_taken',
        message: `Счёт с номером "${input.number}" уже существует`
      });
    }

    // Активный тариф — только для печатной формы и истории; счёт можно выставить и без него.
    const plans = await db.query<{ id: string; name: string }>(
      `select p.id, p.name from core.plans p
       join core.tenant_subscriptions s on s.plan_id = p.id
       where s.tenant_id = $1 and s.status = 'active' limit 1`,
      [input.tenantId]
    );
    const plan = plans[0];
    const providerCode = input.providerCode ?? 'manual';
    // Срок по умолчанию — 5 рабочих дней: счёт без срока оплаты нечем просрочить,
    // а значит и grace никогда не наступит.
    const dueAt = input.dueAt ?? addWorkingDays(new Date().toISOString().slice(0, 10), 5);
    const id = `rinv_${input.tenantId}_${input.number}`.replaceAll(/[^\w-]/g, '_');

    await db.query(
      `insert into core.rental_invoices
         (id, tenant_id, plan_id, number, period_start, period_end, amount_kopecks, currency, status, due_at, provider_code)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, 'issued', $9::date, $10)`,
      [
        id,
        input.tenantId,
        plan?.id ?? null,
        input.number,
        input.periodStart,
        input.periodEnd,
        input.amountKopecks,
        input.currency ?? 'RUB',
        dueAt,
        providerCode
      ]
    );

    await this.auditService.writeCritical({
      tenantId: input.tenantId,
      actorId,
      action: 'platform.rental_invoice_issued',
      entityType: 'core.rental_invoice',
      entityId: id,
      metadata: { number: input.number, amountKopecks: input.amountKopecks, dueAt },
      requestId: context.requestId,
      correlationId: context.correlationId
    });

    const [invoice] = await db.query<RentalInvoice>(
      `select ${INVOICE_COLUMNS} from core.rental_invoices where id = $1`,
      [id]
    );
    const normalized = normalizeInvoice(invoice!);

    const provider = this.providers?.get(providerCode);
    const issued = provider
      ? await provider.issue({
          invoiceId: id,
          tenantId: input.tenantId,
          tenantName: tenant.name,
          number: input.number,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          amountKopecks: input.amountKopecks,
          currency: input.currency ?? 'RUB',
          dueAt,
          planName: plan?.name
        })
      : null;

    return issued?.document
      ? { invoice: normalized, document: issued.document }
      : { invoice: normalized };
  }

  /**
   * Печатная форма существующего счёта. Пересобирается на лету, а не хранится: счёт
   * детерминирован (те же данные → тот же PDF), и лишний файл в хранилище означал бы
   * второй источник правды о сумме.
   */
  async renderInvoiceDocument(
    invoiceId: string
  ): Promise<NonNullable<RentalInvoiceIssueResult['document']>> {
    const db = this.requireDb();
    const rows = await db.query<RentalInvoice & { tenantName: string; planName: string | null }>(
      `select i.id, i.tenant_id as "tenantId", i.plan_id as "planId", i.number,
              i.period_start::text as "periodStart", i.period_end::text as "periodEnd",
              i.amount_kopecks as "amountKopecks", i.currency, i.status,
              i.due_at::text as "dueAt", i.issued_at as "issuedAt", i.paid_at as "paidAt",
              i.provider_code as "providerCode",
              t.name as "tenantName", p.name as "planName"
       from core.rental_invoices i
       join core.tenants t on t.id = i.tenant_id
       left join core.plans p on p.id = i.plan_id
       where i.id = $1`,
      [invoiceId]
    );
    const invoice = rows[0];
    if (!invoice) {
      throw new NotFoundException({ code: 'invoice_not_found', message: 'Invoice not found' });
    }
    const provider = this.providers?.get(invoice.providerCode);
    const issued = await provider?.issue({
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      tenantName: invoice.tenantName,
      number: invoice.number,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      amountKopecks: Number(invoice.amountKopecks),
      currency: invoice.currency,
      dueAt: invoice.dueAt,
      planName: invoice.planName ?? undefined
    });
    if (!issued?.document) {
      throw new ServiceUnavailableException({
        code: 'invoice_document_unavailable',
        message: 'Печатная форма недоступна: сервис конвертации не ответил'
      });
    }
    return issued.document;
  }

  /**
   * Отметка оплаты. Идемпотентна: повторное подтверждение уже оплаченного счёта — не
   * ошибка (бухгалтер мог нажать дважды), но и дату оплаты не сдвигает.
   */
  async markPaid(
    actorId: string | undefined,
    invoiceId: string,
    context: RequestContext
  ): Promise<RentalInvoice> {
    const db = this.requireDb();
    const rows = await db.query<RentalInvoice>(
      `select ${INVOICE_COLUMNS} from core.rental_invoices where id = $1`,
      [invoiceId]
    );
    const invoice = rows[0];
    if (!invoice) {
      throw new NotFoundException({ code: 'invoice_not_found', message: 'Invoice not found' });
    }
    if (invoice.status === 'cancelled') {
      throw new ConflictException({
        code: 'invoice_cancelled',
        message: 'Отменённый счёт нельзя отметить оплаченным'
      });
    }
    if (invoice.status === 'paid') return normalizeInvoice(invoice);

    await db.query(
      `update core.rental_invoices set status = 'paid', paid_at = now(), updated_at = now()
       where id = $1`,
      [invoiceId]
    );
    await this.auditService.writeCritical({
      tenantId: invoice.tenantId,
      actorId,
      action: 'platform.rental_invoice_paid',
      entityType: 'core.rental_invoice',
      entityId: invoiceId,
      metadata: { number: invoice.number },
      requestId: context.requestId,
      correlationId: context.correlationId
    });

    const [updated] = await db.query<RentalInvoice>(
      `select ${INVOICE_COLUMNS} from core.rental_invoices where id = $1`,
      [invoiceId]
    );
    return normalizeInvoice(updated!);
  }

  /**
   * Обход просрочки: арендаторы с неоплаченным счётом, у которых истёк grace, переводятся
   * в `suspended`. Возвращает список приостановленных — планировщик его логирует.
   *
   * Приостанавливаем ТОЛЬКО активных и пробных: повторно «приостанавливать»
   * приостановленного незачем, а архивного — тем более (офбординг уже случился).
   */
  async suspendOverdueTenants(
    today: string,
    context?: Partial<RequestContext>
  ): Promise<{ tenantId: string; invoiceNumber: string }[]> {
    const db = this.requireDb();
    const rows = await db.query<{
      id: string;
      tenantId: string;
      number: string;
      dueAt: string;
      graceWorkingDays: number | null;
    }>(
      `select i.id, i.tenant_id as "tenantId", i.number, i.due_at::text as "dueAt",
              p.grace_working_days as "graceWorkingDays"
       from core.rental_invoices i
       join core.tenants t on t.id = i.tenant_id
       left join core.plans p on p.id = i.plan_id
       where i.status = 'issued' and t.status in ('active', 'trial')`
    );

    const suspended: { tenantId: string; invoiceNumber: string }[] = [];
    for (const row of rows) {
      // Нет тарифа у счёта — берём тот же дефолт, что стоит в схеме (10 рабочих дней).
      const grace = row.graceWorkingDays ?? 10;
      if (!isGraceExpired(row.dueAt, grace, today)) continue;
      await db.query(
        `update core.tenants set status = 'suspended', updated_at = now() where id = $1`,
        [row.tenantId]
      );
      await this.auditService.writeCritical({
        tenantId: row.tenantId,
        action: 'platform.tenant_suspended_for_nonpayment',
        entityType: 'core.tenant',
        entityId: row.tenantId,
        metadata: {
          invoiceId: row.id,
          invoiceNumber: row.number,
          dueAt: row.dueAt,
          graceWorkingDays: grace
        },
        ...(context?.requestId ? { requestId: context.requestId } : {}),
        ...(context?.correlationId ? { correlationId: context.correlationId } : {})
      });
      this.logger.warn(
        `Tenant ${row.tenantId} suspended: invoice ${row.number} unpaid past ${grace} working days after ${row.dueAt}`
      );
      suspended.push({ tenantId: row.tenantId, invoiceNumber: row.number });
    }
    return suspended;
  }
}
