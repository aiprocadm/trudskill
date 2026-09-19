import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';

import {
  LIMIT_DEFAULTS,
  type LimitThresholds,
  type UsageState,
  canAddNew,
  limitThresholds,
  usageNotice,
  usageState
} from './plan-limits.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { PlatformPlansService } from '../../platform/platform-plans.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
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
 * Мягкая деградация (D4.2): превышение лимита блокирует добавление НОВЫХ на границе API
 * (`assertCanAddLearners`; сотрудники — `TenantStaffLimitService` на выдаче роли), но никогда не останавливает обучение идущих
 * групп и работу заведённых сотрудников — никакой проверки на путях прохождения курса нет.
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
  /**
   * Состояние по главной статье тарифа и что оно значит для человека (решение Р13).
   *
   * Считается на сервере, а не на экране: тот же расчёт нужен гейтам, и два независимых
   * подсчёта «исчерпан ли тариф» неизбежно разъехались бы — экран говорил бы «всё в порядке»,
   * а ручка отвечала бы отказом.
   */
  limit: {
    state: UsageState;
    tone: 'none' | 'warning' | 'danger';
    notice: string;
  };
}

@Injectable()
export class TenantUsageService {
  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined,
    @Inject(PlatformPlansService) private readonly plans: PlatformPlansService,
    @Inject(TenantStorageService) private readonly storage: TenantStorageService,
    /* Настройки платформы — необязательная и ПОСЛЕДНЯЯ зависимость (журнал 526). */
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService
  ) {}

  async getUsage(tenantId: string): Promise<TenantUsageReport> {
    const [plan, storageUsage, activeLearners, staff, thresholds] = await Promise.all([
      this.plans.getActivePlan(tenantId),
      this.storage.getUsage(tenantId),
      this.activeLearnersCount(tenantId),
      this.staffCount(tenantId),
      this.thresholds()
    ]);
    return {
      plan: plan ? { code: plan.code, name: plan.name, features: plan.features } : null,
      activeLearners: { used: activeLearners, limit: plan?.activeLearnersLimit ?? null },
      staff: { used: staff, limit: plan?.staffLimit ?? null },
      limit: (() => {
        const state = usageState(activeLearners, plan?.activeLearnersLimit ?? null, thresholds);
        const notice = usageNotice(state, activeLearners, plan?.activeLearnersLimit ?? null);
        return { state, tone: notice.tone, notice: notice.text };
      })(),
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
    await this.assertCanStartNew(tenantId, 'Новых слушателей добавить нельзя');
  }

  /**
   * Гейт «нельзя ЗАПУСТИТЬ новую группу» (решение Р13).
   *
   * Р13 перечисляет ровно две вещи, которые прекращаются при превышении: добавление новых
   * слушателей и запуск новых групп. Второе не было закрыто ничем — центр с исчерпанным тарифом
   * не мог добавить человека, но мог завести сколько угодно групп (журнал 553).
   */
  async assertCanStartGroup(tenantId: string): Promise<void> {
    await this.assertCanStartNew(tenantId, 'Новые группы запускать нельзя');
  }

  /**
   * Общее правило превышения: что именно запрещено — сказано словом, а что продолжается —
   * названо прямо. Отказ без второй половины читается как «у нас всё встало», и центр звонит
   * в поддержку вместо того, чтобы докупить тариф.
   */
  private async assertCanStartNew(tenantId: string, whatIsBlocked: string): Promise<void> {
    const plan = await this.plans.getActivePlan(tenantId);
    const limit = plan?.activeLearnersLimit;
    if (limit === null || limit === undefined) return;
    const used = await this.activeLearnersCount(tenantId);
    if (!canAddNew(usageState(used, limit, await this.thresholds()))) {
      throw new ConflictException({
        code: 'learner_limit_reached',
        message:
          `Лимит тарифа «${plan!.name}» исчерпан: активных слушателей ${used} из ${limit}. ` +
          `${whatIsBlocked}. Обучение идущих групп, выдача документов уже отучившимся ` +
          'и выгрузки в реестр продолжаются.'
      });
    }
  }

  /** Пороги предупреждений — настройка платформы; непригодная настройка откатывается к 80 %. */
  private async thresholds(): Promise<LimitThresholds> {
    if (!this.tenants) return LIMIT_DEFAULTS;
    try {
      const settings = await this.tenants.getSettings('platform');
      return limitThresholds(settings.payload);
    } catch {
      /* Настроек платформы может не быть вовсе — это не повод перестать предупреждать. */
      return LIMIT_DEFAULTS;
    }
  }

  /**
   * Активные слушатели расчётного месяца — РОВНО по решению владельца Р12.
   *
   * **Определение Р12 дословно:** «уникальный человек, который в расчётном месяце НАЧАЛ
   * обучение или ПОЛУЧИЛ ДОКУМЕНТ».
   *
   * **Что здесь было и почему это стоило денег центру (журнал 553).** Прежний запрос считал
   * всех, у кого есть незакрытое зачисление, — независимо от того, когда оно началось. Человек,
   * записанный в январе и учащийся полгода, попадал в счёт КАЖДЫЙ месяц. Это ровно та модель
   * «оплата за место в системе», которую Р12 отвергает со словами «штрафует за архив»: центр
   * платил за длинные программы дважды, трижды и далее, хотя по решению должен был заплатить
   * один раз — в месяц начала обучения.
   *
   * **Почему «получил документ» считается по ЗАВЕРШЕНИЮ обучения, а не по самой бумаге.**
   * Первый заход брал документы из нормализованной таблицы выпущенных документов — и сторож
   * «ограничение на живой таблице» показал, что она НЕ ПИШЕТСЯ: документы хранятся снимками
   * (см. `docs/mvp-domain-database.md`). Запрос всегда возвращал бы ноль документов, то есть
   * считал бы тариф молча неверно — тише и хуже прежнего дефекта.
   * Документ выпускается по завершении обучения (`enrollment-document-issuance.listener`),
   * поэтому завершение — тот же случай, выраженный через данные, которые в базе действительно
   * есть. Когда документы переедут в нормализованное хранение, эту половину надо считать по
   * ним напрямую; сторож мёртвых таблиц о переезде не даст забыть.
   *
   * Отменённые зачисления не считаются: человек обучение не начинал.
   */
  private async activeLearnersCount(tenantId: string): Promise<number> {
    if (!this.databaseService) return 0;
    const rows = await this.databaseService.query<{ count: number }>(
      `select count(distinct learner_id)::int as count
       from (
         select e.learner_id
         from learning.enrollments e
         where e.tenant_id = $1
           and e.status <> 'cancelled'
           and e.enrolled_at >= date_trunc('month', now())
           and e.enrolled_at < date_trunc('month', now()) + interval '1 month'
         union
         select e.learner_id
         from learning.enrollments e
         where e.tenant_id = $1
           and e.status = 'completed'
           and e.completed_at >= date_trunc('month', now())
           and e.completed_at < date_trunc('month', now()) + interval '1 month'
       ) as billable`,
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
