import { Inject, Injectable, Optional } from '@nestjs/common';

import { REMINDER_DEFAULTS, reminderMilestones } from './reminder-settings.js';
import { TenantService } from '../../tenant/tenant.service.js';

import type { ReminderKind } from './reminder-settings.js';

/**
 * Пороги напоминаний конкретного центра (ТЗ 11.3, решение Р11).
 *
 * Отдельная служба, а не чтение настроек в каждом сканере: иначе правило «непригодная настройка
 * откатывается к умолчанию» пришлось бы повторить трижды, и однажды оно разошлось бы.
 *
 * Настройки центра — необязательная зависимость: сканеры работают и там, где база настроек не
 * поднята (внутренние прогоны, память). Отсутствие настроек и любая ошибка их чтения означают
 * одно и то же — берём умолчания Р11, а не молчим.
 */
@Injectable()
export class ReminderSettingsService {
  /* Метка обязательна: сборщик выбрасывает сведения о типах, и зависимость «по типу»
     превращается в undefined уже на живом сервере (сторож `di-explicit-injection`). */
  constructor(@Optional() @Inject(TenantService) private readonly tenants?: TenantService) {}

  async milestones(tenantId: string, kind: ReminderKind): Promise<readonly number[]> {
    if (!this.tenants) return REMINDER_DEFAULTS[kind];
    try {
      const settings = await this.tenants.getSettings(tenantId);
      return reminderMilestones(kind, settings.payload);
    } catch {
      /* Настроек у центра может не быть вовсе — это не повод перестать предупреждать о сроках. */
      return REMINDER_DEFAULTS[kind];
    }
  }
}
