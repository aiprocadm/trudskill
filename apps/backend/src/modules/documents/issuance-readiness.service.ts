import { Inject, Injectable, Optional, PreconditionFailedException } from '@nestjs/common';

import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type { DocumentsPersistenceBackend } from './infrastructure/documents-persistence.backend.js';

/**
 * Документы не выдаются, пока центр не настроен (ТЗ «Стабилизация, UX и развитие», 8.2, Р6).
 *
 * **Зачем запрет.** Удостоверение без реквизитов, без действующей лицензии, без комиссии, без
 * бланка и без номера — это не документ, а бумага: в реестре его не найти, при проверке он
 * недействителен. Решение Р6 прямо требует «запрет выдачи документов, пока не закрыты
 * обязательные шаги — с понятным объяснением, а не молчаливой ошибкой» (журнал 528).
 *
 * **Почему проверка живёт здесь, а не в мастере первого запуска.** Мастер — экран; запрет должен
 * действовать и когда документ выпускается не с экрана (по завершении обучения, массовым
 * приказом, из портала). Поэтому проверка стоит там, где документ РОЖДАЕТСЯ, и читает нужное
 * сама, не завися от модуля мастера: иначе получилась бы круговая зависимость модулей.
 */

/** Шаги решения Р6, без которых документ выдавать нельзя. */
export interface IssuanceReadiness {
  requisites: boolean;
  license: boolean;
  commission: boolean;
  template: boolean;
  numbering: boolean;
}

/** Что человек должен сделать, названное его словами и с указанием места. */
const STEP_TEXT: Record<keyof IssuanceReadiness, string> = {
  requisites: 'заполнить реквизиты центра (Настройки → Реквизиты)',
  license: 'добавить действующую лицензию (Настройки → Лицензии и аккредитации)',
  commission: 'назначить аттестационную комиссию (Настройки → Комиссия)',
  template: 'загрузить бланк документа (Документы → Шаблоны)',
  numbering: 'задать правило нумерации документов (Документы → Нумерация)'
};

/**
 * Сообщение о запрете — чистая функция.
 *
 * Отказ обязан говорить, ЧТО не сделано и КУДА идти: «Ошибка 412» человеку ничего не сообщает
 * (правило продукта №4). `null` означает «всё готово, запрета нет».
 */
export const issuanceBlockedMessage = (readiness: IssuanceReadiness): string | null => {
  const missing = (Object.keys(STEP_TEXT) as Array<keyof IssuanceReadiness>).filter(
    (key) => !readiness[key]
  );
  if (missing.length === 0) return null;
  const list = missing.map((key) => STEP_TEXT[key]).join('; ');
  return `Документы пока выдавать нельзя: центр настроен не до конца. Осталось ${list}.`;
};

@Injectable()
export class IssuanceReadinessService {
  constructor(
    @Inject(DOCUMENTS_PERSISTENCE_BACKEND)
    private readonly documents: DocumentsPersistenceBackend,
    @Optional() @Inject(DatabaseService) private readonly database?: DatabaseService
  ) {}

  async readiness(tenantId: string): Promise<IssuanceReadiness> {
    const state = new InMemoryDocumentsState();
    await this.documents.loadIntoState(tenantId, state).catch(() => undefined);

    const [requisites, license, commission] = await Promise.all([
      this.hasRequisites(tenantId),
      this.count(
        `select count(*)::int as count from org.training_licenses
          where tenant_id = $1 and status = 'active'`,
        tenantId
      ),
      this.count(
        `select count(*)::int as count from learning.commissions where tenant_id = $1`,
        tenantId
      )
    ]);

    return {
      requisites,
      license: license > 0,
      commission: commission > 0,
      template: state.templates.length > 0,
      numbering: state.numberingRules.length > 0
    };
  }

  /**
   * Бросить понятный отказ, если выдавать нельзя.
   *
   * **Без базы проверка не выполняется и запрет не ставится.** Это осознанно: внутренние прогоны
   * и режим памяти не должны получать «центр не настроен» на пустом месте. Запрет — защита от
   * недонастроенного боевого центра, а не способ уронить тесты.
   */
  async assertCanIssue(tenantId: string): Promise<void> {
    if (!this.database) return;
    const message = issuanceBlockedMessage(await this.readiness(tenantId));
    if (message) {
      throw new PreconditionFailedException({ code: 'tenant_not_configured', message });
    }
  }

  private async hasRequisites(tenantId: string): Promise<boolean> {
    if (!this.database) return false;
    try {
      const rows = await this.database.query<{ count: number }>(
        `select count(*)::int as count from org.tenant_requisites
          where tenant_id = $1 and coalesce(legal_name, '') <> '' and coalesce(tax_number, '') <> ''`,
        [tenantId]
      );
      return (rows[0]?.count ?? 0) > 0;
    } catch {
      // База недоступна — считаем шаг незакрытым: врать «настроено» здесь опаснее молчания.
      return false;
    }
  }

  private async count(sql: string, tenantId: string): Promise<number> {
    if (!this.database) return 0;
    try {
      const rows = await this.database.query<{ count: number }>(sql, [tenantId]);
      return rows[0]?.count ?? 0;
    } catch {
      // То же правило: недоступная база не должна выглядеть как «у центра всё готово».
      return 0;
    }
  }
}
