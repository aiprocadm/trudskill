import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

/**
 * Лимит сотрудников из тарифа центра (журнал 306).
 *
 * Тариф объявлял `staff_limit`, экран использования его показывал — и не соблюдал НИКТО:
 * центр с тарифом «10 сотрудников» заводил пятьдесят, а экран показывал «50 из 10» как
 * свершившийся факт. У слушателей такой гейт есть с самого начала (`assertCanAddLearners`),
 * у сотрудников не было.
 *
 * Почему служба живёт в ИНФРАСТРУКТУРЕ, а не рядом с отчётом использования: гейт нужен на
 * выдаче роли, то есть в модуле IAM, а модуль mvp (где живёт отчёт) сам импортирует IAM —
 * обратная зависимость замкнула бы модули в кольцо. Инфраструктуру видят оба.
 *
 * Считает так же, как отчёт: сотрудник — активная учётка хотя бы с одной НЕ-слушательской
 * ролью; лимит — из действующей подписки центра. Без базы (память, тесты) молчит: гейт,
 * который не может посчитать, не имеет права запрещать.
 */
@Injectable()
export class TenantStaffLimitService {
  constructor(@Optional() @Inject(DatabaseService) private readonly db?: DatabaseService) {}

  async assertCanAddStaff(tenantId: string): Promise<void> {
    if (!this.db || !tenantId) return;

    const planRows = await this.db.query<{ staffLimit: number | string | null; name: string }>(
      `select p.staff_limit as "staffLimit", p.name
         from core.plans p
         join core.tenant_subscriptions s on s.plan_id = p.id
        where s.tenant_id = $1 and s.status = 'active'
        limit 1`,
      [tenantId]
    );
    const plan = planRows[0];
    // Нет тарифа или статья не ограничена — безлимит, как и в отчёте использования.
    if (!plan || plan.staffLimit === null || plan.staffLimit === undefined) return;
    // pg отдаёт bigint строкой — та же грабля, что в разборе тарифов платформы.
    const limit = Number(plan.staffLimit);
    if (!Number.isFinite(limit) || limit <= 0) return;

    const usedRows = await this.db.query<{ count: number }>(
      `select count(distinct u.id)::int as count
         from iam.users u
         join iam.user_roles ur on ur.tenant_id = u.tenant_id and ur.user_id = u.id
         join iam.roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id
        where u.tenant_id = $1 and u.status = 'active' and r.code <> 'learner'`,
      [tenantId]
    );
    const used = usedRows[0]?.count ?? 0;

    if (used >= limit) {
      throw new ConflictException({
        code: 'staff_limit_reached',
        message:
          `Лимит тарифа «${plan.name}» исчерпан: сотрудников ${used} из ${limit}. ` +
          'Новых сотрудников добавить нельзя; заведённые продолжают работать.'
      });
    }
  }
}
