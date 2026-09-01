import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ФТ-D4 (Фаза 4 Task 5): тарифы аренды — платформенные сущности.
 *
 * Тарифы определяет владелец платформы; назначение тарифа арендатору — часть
 * управления арендатором (право platform.tenants.write, как список/статусы).
 * С модулем `payments` (заказы слушателей) намеренно не пересекается (D5.3).
 */

/** Функциональные флаги тарифа. Отсутствие ключа = функция выключена. */
export interface PlanFeatures {
  proctoring?: boolean;
  scorm?: boolean;
  api?: boolean;
  webinars?: boolean;
}

export interface PlatformPlan {
  id: string;
  code: string;
  name: string;
  /** null = безлимит по статье. */
  activeLearnersLimit: number | null;
  staffLimit: number | null;
  storageLimitBytes: number | null;
  features: PlanFeatures;
}

export interface TenantSubscription {
  tenantId: string;
  planId: string;
  status: 'active' | 'cancelled';
  startedAt: string;
}

const PLAN_COLUMNS = `id, code, name,
  active_learners_limit as "activeLearnersLimit",
  staff_limit as "staffLimit",
  storage_limit_bytes as "storageLimitBytes",
  features`;

/**
 * `api` убран из списка 2026-09-01 (журнал 325): в отличие от трёх остальных, у него нет
 * определённого смысла — ни в ТЗ, ни в документации не сказано, ЧТО именно он открывает.
 * Флаг, который ничего не обещает конкретного, невозможно ни соблюсти, ни проверить;
 * придумывать смысл за владельца хуже, чем убрать. Вернётся, когда смысл будет назван.
 * Старые тарифы не сломаются: `readPlanFeatures` отбрасывает неизвестные ключи.
 */
export const KNOWN_PLAN_FEATURES = ['proctoring', 'scorm', 'webinars'] as const;

/**
 * pg отдаёт bigint СТРОКОЙ (вскрыто живым прогоном: storageLimitBytes='1073741824') —
 * нормализуем числовые статьи, иначе фронт получает строку там, где ждёт число.
 */
const toNumericLimit = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const normalizePlan = (row: PlatformPlan & { features: unknown }): PlatformPlan => ({
  ...row,
  activeLearnersLimit: toNumericLimit(row.activeLearnersLimit),
  staffLimit: toNumericLimit(row.staffLimit),
  storageLimitBytes: toNumericLimit(row.storageLimitBytes),
  features: readPlanFeatures(row.features)
});

/** Терпимое чтение флагов: не-boolean и неизвестные ключи отбрасываются. */
export const readPlanFeatures = (raw: unknown): PlanFeatures => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const features: PlanFeatures = {};
  for (const key of KNOWN_PLAN_FEATURES) {
    if (typeof source[key] === 'boolean') features[key] = source[key];
  }
  return features;
};

@Injectable()
export class PlatformPlansService {
  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'plan_store_unavailable',
        message: 'Plan store is unavailable'
      });
    }
    return this.databaseService;
  }

  async listPlans(): Promise<PlatformPlan[]> {
    const rows = await this.requireDb().query<PlatformPlan & { features: unknown }>(
      `select ${PLAN_COLUMNS} from core.plans order by code`
    );
    return rows.map(normalizePlan);
  }

  async createPlan(
    actorId: string | undefined,
    input: {
      code: string;
      name: string;
      activeLearnersLimit?: number | null;
      staffLimit?: number | null;
      storageLimitBytes?: number | null;
      features?: PlanFeatures;
    },
    context: RequestContext
  ): Promise<PlatformPlan> {
    const db = this.requireDb();
    const id = `plan_${input.code}`;
    const existing = await db.query<{ id: string }>('select id from core.plans where code = $1', [
      input.code
    ]);
    if (existing.length > 0) {
      throw new ConflictException({
        code: 'plan_code_taken',
        message: `Plan with code "${input.code}" already exists`
      });
    }
    await db.query(
      `insert into core.plans (id, code, name, active_learners_limit, staff_limit, storage_limit_bytes, features)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        id,
        input.code,
        input.name,
        input.activeLearnersLimit ?? null,
        input.staffLimit ?? null,
        input.storageLimitBytes ?? null,
        JSON.stringify(readPlanFeatures(input.features ?? {}))
      ]
    );
    await this.auditService.writeCritical({
      tenantId: 'platform',
      actorId,
      action: 'platform.plan_created',
      entityType: 'core.plan',
      entityId: id,
      metadata: { code: input.code },
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    const [plan] = await db.query<PlatformPlan & { features: unknown }>(
      `select ${PLAN_COLUMNS} from core.plans where id = $1`,
      [id]
    );
    return normalizePlan(plan!);
  }

  /**
   * Назначение тарифа: прежняя активная подписка отменяется, новая создаётся —
   * история сохраняется (частичный unique позволяет любое число cancelled-строк).
   */
  async assignPlan(
    actorId: string | undefined,
    tenantId: string,
    planId: string,
    context: RequestContext
  ): Promise<TenantSubscription> {
    const db = this.requireDb();
    const plans = await db.query<{ id: string }>('select id from core.plans where id = $1', [
      planId
    ]);
    if (plans.length === 0) {
      throw new NotFoundException({ code: 'plan_not_found', message: 'Plan not found' });
    }
    const tenants = await db.query<{ id: string }>('select id from core.tenants where id = $1', [
      tenantId
    ]);
    if (tenants.length === 0) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }

    await db.query(
      `update core.tenant_subscriptions
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
       where tenant_id = $1 and status = 'active'`,
      [tenantId]
    );
    const id = `tsub_${tenantId}_${Date.now()}`;
    await db.query(
      `insert into core.tenant_subscriptions (id, tenant_id, plan_id, status)
       values ($1, $2, $3, 'active')`,
      [id, tenantId, planId]
    );
    // Аудит в журнал ЦЕЛЕВОГО тенанта: смена тарифа — событие его жизни.
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'platform.plan_assigned',
      entityType: 'core.tenant_subscription',
      entityId: id,
      metadata: { planId, platformActorId: actorId },
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return { tenantId, planId, status: 'active', startedAt: new Date().toISOString() };
  }

  /** Активный тариф тенанта; null = тариф не назначен (все лимиты = безлимит). */
  async getActivePlan(tenantId: string): Promise<PlatformPlan | null> {
    const rows = await this.requireDb().query<PlatformPlan & { features: unknown }>(
      `select p.id, p.code, p.name,
         p.active_learners_limit as "activeLearnersLimit",
         p.staff_limit as "staffLimit",
         p.storage_limit_bytes as "storageLimitBytes",
         p.features
       from core.plans p
       join core.tenant_subscriptions s on s.plan_id = p.id
       where s.tenant_id = $1 and s.status = 'active'
       limit 1`,
      [tenantId]
    );
    const plan = rows[0];
    return plan ? normalizePlan(plan) : null;
  }
}
