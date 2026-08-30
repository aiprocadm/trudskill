import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { DEFAULT_TENANT_TIMEZONE } from '../../common/utils/tenant-calendar.js';
import { DatabaseService } from '../database/database.service.js';

/** Сколько живёт запомненный пояс. Настройку меняют раз в жизни центра — минуты хватает. */
const CACHE_TTL_MS = 60_000;

/**
 * Часовой пояс центра для расчёта календарных дат (журнал 300).
 *
 * Живёт в инфраструктуре, а не в модуле центра, намеренно: её просит перехватчик запросов
 * документов, а он инстанцируется в КАЖДОМ модуле, который его применяет (esign, mvp,
 * documents). Из модуля центра она была бы им не видна — Nest ищет провайдера в модуле,
 * которому принадлежит контроллер.
 *
 * Отдельная служба, а не `TenantService.getSettings`, по двум причинам:
 *
 *  1. `getSettings` БРОСАЕТ `NotFoundException`, если строки настроек нет. Для экрана
 *     настроек это верно, а для выпуска документа — нет: центр без строки настроек обязан
 *     продолжать работать на поясе по умолчанию, а не терять возможность выдать удостоверение.
 *  2. Пояс спрашивают на каждом запросе, а меняют раз в жизни центра — здесь он кэшируется.
 *
 * Без базы (memory-драйвер, тесты) отвечает значением по умолчанию.
 */
@Injectable()
export class TenantTimezoneService {
  private readonly logger = new Logger(TenantTimezoneService.name);
  private readonly cache = new Map<string, { timezone: string; expiresAt: number }>();

  constructor(@Optional() @Inject(DatabaseService) private readonly db?: DatabaseService) {}

  async resolve(tenantId: string): Promise<string> {
    if (!tenantId) return DEFAULT_TENANT_TIMEZONE;

    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.timezone;
    }
    if (!this.db) {
      return DEFAULT_TENANT_TIMEZONE;
    }

    let timezone = DEFAULT_TENANT_TIMEZONE;
    try {
      const rows = await this.db.query<{ payload: Record<string, unknown> | null }>(
        'select payload from org.tenant_settings where tenant_id = $1',
        [tenantId]
      );
      const raw = rows[0]?.payload?.timezone;
      if (typeof raw === 'string' && raw.trim()) {
        timezone = raw.trim();
      }
    } catch (error) {
      // Настройки недоступны — это не повод ронять запрос: считаем по поясу по умолчанию.
      this.logger.warn(
        `Не удалось прочитать часовой пояс центра ${tenantId}: ${(error as Error).message}`
      );
      return DEFAULT_TENANT_TIMEZONE;
    }

    this.cache.set(tenantId, { timezone, expiresAt: Date.now() + CACHE_TTL_MS });
    return timezone;
  }

  /** Забыть запомненное — зовётся после правки настроек центра, чтобы новый пояс подхватился сразу. */
  forget(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
