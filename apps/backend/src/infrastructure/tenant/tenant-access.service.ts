import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

import type { TenantStatus } from '../../modules/tenant/tenant.types.js';

type SessionDecision = 'allow' | 'tenant_suspended' | 'tenant_archived';

/**
 * Статус арендатора, который кто-то проверяет (журнал 337).
 *
 * Жизненный цикл `trial | active | suspended | archived` объявлен в 0072, биллинг переводит
 * неплательщика в `suspended` (§5.233), платформенная админка — в `archived`, и документы
 * проекта писали «suspended отключает арендатора». Отключал его никто: вход, magic-link, ЕСИА
 * и обновление сессии в `core.tenants` не заглядывали. Приостановленный за неуплату центр
 * работал как ни в чём не бывало — только ночные рассылки его пропускали.
 *
 * Здесь — единственное место, где статус превращается в решение «выдавать ли сессию».
 * Двери, которые сюда ходят: `AuthService.issueSessionForUser` (пароль, ЕСИА, magic-link —
 * до TOTP) и `AuthService.refresh` (живая вкладка не должна продлевать доступ). Вход «от имени»
 * сюда НЕ ходит: поддержке в приостановленный центр можно (архивный отбивает
 * `PlatformTenantsService`), и обновление такой сессии тоже пропускается.
 *
 * Почему в инфраструктуре, а не в модуле tenant: гейт нужен в IAM, а модуль tenant сам живёт
 * поверх IAM — обратная зависимость замкнула бы кольцо. Тот же довод, что у лимита сотрудников.
 * Без базы (память, тесты) молчит: гейт, который не может посмотреть, не имеет права запрещать.
 */
@Injectable()
export class TenantAccessService {
  /**
   * Решение по КАЖДОМУ статусу из CHECK 0072 — явно. Тест сверяет ключи с миграцией: новый
   * статус в базе без строки здесь роняет тест, а не пускает «по умолчанию».
   */
  static readonly SESSION_DECISION: Readonly<Record<TenantStatus, SessionDecision>> = {
    trial: 'allow',
    active: 'allow',
    suspended: 'tenant_suspended',
    archived: 'tenant_archived'
  };

  constructor(@Optional() @Inject(DatabaseService) private readonly db?: DatabaseService) {}

  async assertAcceptsSessions(tenantId: string): Promise<void> {
    if (!this.db) return;

    const rows = await this.db.query<{ status: string }>(
      'select status from core.tenants where id = $1',
      [tenantId]
    );
    const status = rows[0]?.status;
    if (status === undefined) {
      throw new UnauthorizedException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }

    // Неизвестный статус — отказ, как нормализация мусора в 0072 (мусор → suspended, не → active):
    // неизвестное состояние не должно держать арендатора работающим.
    const decision =
      (TenantAccessService.SESSION_DECISION as Record<string, SessionDecision | undefined>)[
        status
      ] ?? 'tenant_suspended';
    if (decision === 'allow') return;

    throw new UnauthorizedException({
      code: decision,
      message:
        decision === 'tenant_archived'
          ? 'Tenant is archived; sessions are not issued'
          : 'Tenant is suspended; sessions are not issued'
    });
  }
}
