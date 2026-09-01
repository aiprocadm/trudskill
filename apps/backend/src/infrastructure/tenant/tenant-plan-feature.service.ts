import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

/**
 * Возможности тарифа центра (журнал 325).
 *
 * Тариф объявлял `proctoring` / `scorm` / `webinars`: они хранились в `core.plans.features`,
 * разбирались, отдавались ручкой платформы и показывались — и не проверялись НИКЕМ. Центр на
 * тарифе без прокторинга пользовался им свободно. Тот же класс, что записи 306/307 (лимиты
 * объявлялись и не соблюдались), только про возможности, а не про числа.
 *
 * Служба живёт в инфраструктуре по той же причине, что и лимит сотрудников: гейты нужны в
 * разных модулях (`mvp`, `communication`), а инфраструктуру видят все — иначе модули
 * замкнулись бы в кольцо.
 *
 * **Главное решение — что считать «не входит в тариф».** Запрещает ТОЛЬКО явное `false`.
 * Строгое чтение («нет флага в списке = возможность не входит») выглядит правильнее, но
 * сегодня флаги не проставлены ни у одного центра: такое чтение выключило бы прокторинг,
 * SCORM и вебинары у ВСЕХ разом в момент вливания. Выбран нестрогий вариант: флаг наконец
 * что-то значит, а поведение действующих центров не меняется. Перейти к строгому — решение
 * владельца, и оно требует сперва проставить флаги в тарифах.
 */
export type PlanFeatureCode = 'proctoring' | 'scorm' | 'webinars';

/** Человеческие подписи: код возможности пользователю ничего не говорит. */
const FEATURE_LABELS: Record<PlanFeatureCode, string> = {
  proctoring: 'прокторинг (видеонаблюдение на экзамене)',
  scorm: 'учебные пакеты SCORM',
  webinars: 'вебинары'
};

@Injectable()
export class TenantPlanFeatureService {
  constructor(@Optional() @Inject(DatabaseService) private readonly db?: DatabaseService) {}

  async assertFeature(tenantId: string, feature: PlanFeatureCode): Promise<void> {
    // Без базы (память, тесты) гейт молчит: запрещать, не сумев проверить, нельзя.
    if (!this.db || !tenantId) return;

    const rows = await this.db.query<{ name: string; features: unknown }>(
      `select p.name, p.features
         from core.plans p
         join core.tenant_subscriptions s on s.plan_id = p.id
        where s.tenant_id = $1 and s.status = 'active'
        limit 1`,
      [tenantId]
    );
    const plan = rows[0];
    if (!plan) return; // Нет действующего тарифа — ограничивать нечем.

    const features = plan.features;
    if (typeof features !== 'object' || features === null || Array.isArray(features)) return;

    const value = (features as Record<string, unknown>)[feature];
    // Мусор вместо флага — это не «выключено»: терпимое чтение, как в разборе тарифов.
    if (value !== false) return;

    throw new ForbiddenException({
      code: 'plan_feature_unavailable',
      message:
        `Тариф «${plan.name}» не включает ${FEATURE_LABELS[feature]}. ` +
        'Чтобы подключить, обратитесь к администратору платформы.'
    });
  }
}
