import { Inject, Injectable, Optional } from '@nestjs/common';

import { type LearnerExtraFieldDef, learnerExtraFieldsFrom } from './learner-extra-fields.js';
import { TenantService } from '../../tenant/tenant.service.js';

/**
 * Описание именованных полей личного дела из настроек центра (МГ-C1.3, РМ84) — по образцу
 * `GroupSettingsService`: без базы или без настроек полей нет, и карточка работает как раньше.
 */
@Injectable()
export class LearnerFieldsSettingsService {
  constructor(@Optional() @Inject(TenantService) private readonly tenants?: TenantService) {}

  async forTenant(tenantId: string): Promise<LearnerExtraFieldDef[]> {
    if (!this.tenants) return [];
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return learnerExtraFieldsFrom(stored.payload);
    } catch {
      /* Настроек у центра может не быть — именованных полей тогда просто нет. */
      return [];
    }
  }
}
