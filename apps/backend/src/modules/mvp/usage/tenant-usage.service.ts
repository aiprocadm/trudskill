import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { PlatformPlansService } from '../../platform/platform-plans.service.js';
import { TenantStorageService } from '../video/tenant-storage.service.js';

import type { PlanFeatures } from '../../platform/platform-plans.service.js';

/**
 * ФТ-D4 (Фаза 4 Task 5): использование тарифа арендатором.
 *
 * Счётчики считаются ЗАПРОСАМИ по типизированным таблицам (0016), а не копятся
 * отдельной таблицей: счётчик, который можно пересчитать, не может разъехаться
 * с реальностью. «Активные слушатели в месяц» — биллинговая метрика: слушатели
 * с незавершённым зачислением ПЛЮС завершившие в текущем календарном месяце
 * (они занимали место в этом месяце; отменённые — нет).
 *
 * Мягкая деградация (D4.2): превышение лимита слушателей блокирует добавление
 * НОВЫХ (assertCanAddLearners на границе API), но никогда не останавливает
 * обучение идущих групп — никакой проверки на путях прохождения курса нет.
 */

export interface UsageMetric {
  used: number;
  /** null = безлимит (нет тарифа или статья не ограничена). */
  limit: number | null;
}

export interface TenantUsageReport {
  plan: { code: string; name: string; features: PlanFeatures } | null;
  activeLearners: UsageMetric;
  staff: UsageMetric;
  storage: { usedBytes: number; limitBytes: number | null };
}

@Injectable()
export class TenantUsageService {
  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined,
    @Inject(PlatformPlansService) private readonly plans: PlatformPlansService,
    @Inject(TenantStorageService) private readonly storage: TenantStorageService
  ) {}

  async getUsage(tenantId: string): Promise<TenantUsageReport> {
    const [plan, storageUsage, activeLearners, staff] = await Promise.all([
      this.plans.getActivePlan(tenantId),
      this.storage.getUsage(tenantId),
      this.activeLearnersCount(tenantId),
      this.staffCount(tenantId)
    ]);
    return {
      plan: plan ? { code: plan.code, name: plan.name, features: plan.features } : null,
      activeLearners: { used: activeLearners, limit: plan?.activeLearnersLimit ?? null },
      staff: { used: staff, limit: plan?.staffLimit ?? null },
      storage: {
        usedBytes: storageUsage.usedBytes,
        // Лимит хранилища тарифа главнее ручного (ФТ-B1.3 оговаривал: ручной лимит —
        // ВРЕМЕННО, до тарифов); нет тарифа — действует прежний ручной ключ настроек.
        limitBytes: plan?.storageLimitBytes ?? storageUsage.limitBytes
      }
    };
  }

  /**
   * Гейт «нельзя добавить НОВЫХ слушателей при превышении». Ровно на границе
   * создания: уже добавленные учатся дальше при любом использовании.
   */
  async assertCanAddLearners(tenantId: string): Promise<void> {
    const plan = await this.plans.getActivePlan(tenantId);
    const limit = plan?.activeLearnersLimit;
    if (limit === null || limit === undefined) return;
    const used = await this.activeLearnersCount(tenantId);
    if (used >= limit) {
      throw new ConflictException({
        code: 'learner_limit_reached',
        message:
          `Лимит тарифа «${plan!.name}» исчерпан: активных слушателей ${used} из ${limit}. ` +
          'Новых слушателей добавить нельзя; идущие группы продолжают обучение.'
      });
    }
  }

  private async activeLearnersCount(tenantId: string): Promise<number> {
    if (!this.databaseService) return 0;
    const rows = await this.databaseService.query<{ count: number }>(
      `select count(distinct e.learner_id)::int as count
       from learning.enrollments e
       where e.tenant_id = $1
         and (
           e.status in ('pending', 'active')
           or (e.status = 'completed' and e.completed_at >= date_trunc('month', now()))
         )`,
      [tenantId]
    );
    return rows[0]?.count ?? 0;
  }

  /** Сотрудники = активные пользователи хотя бы с одной НЕ-слушательской ролью. */
  private async staffCount(tenantId: string): Promise<number> {
    if (!this.databaseService) return 0;
    const rows = await this.databaseService.query<{ count: number }>(
      `select count(distinct u.id)::int as count
       from iam.users u
       join iam.user_roles ur on ur.tenant_id = u.tenant_id and ur.user_id = u.id
       join iam.roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id
       where u.tenant_id = $1 and u.status = 'active' and r.code <> 'learner'`,
      [tenantId]
    );
    return rows[0]?.count ?? 0;
  }
}
