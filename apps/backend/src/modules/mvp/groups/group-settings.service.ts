import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  DEFAULT_GROUP_CREATION_SETTINGS,
  type GroupCreationSettings,
  groupCreationSettingsFrom
} from './group-defaults.js';
import { TenantService } from '../../tenant/tenant.service.js';

/**
 * Шаблон кода и значения по умолчанию для новой группы — из настроек центра (МГ-B1.1/B1.2).
 * Живёт рядом с контроллером, а не в `MvpService`: его конструктор собирают позиционно 36 тестов.
 * Настройки центра — необязательная зависимость: без базы настроек (память, тесты) работают
 * значения по умолчанию; отсутствие строки настроек (404) — тоже не отказ.
 */
@Injectable()
export class GroupSettingsService {
  constructor(@Optional() @Inject(TenantService) private readonly tenants?: TenantService) {}

  async forTenant(tenantId: string): Promise<GroupCreationSettings> {
    if (!this.tenants) return DEFAULT_GROUP_CREATION_SETTINGS;
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return groupCreationSettingsFrom(stored.payload);
    } catch {
      /* Настроек у центра может не быть вовсе — группу всё равно можно создать по умолчаниям. */
      return DEFAULT_GROUP_CREATION_SETTINGS;
    }
  }
}
