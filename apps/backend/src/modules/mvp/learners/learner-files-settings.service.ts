import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  DEFAULT_LEARNER_FILES_SETTINGS,
  type LearnerFilesSettings,
  learnerFilesSettingsFrom
} from './learner-files-settings.js';
import { TenantService } from '../../tenant/tenant.service.js';

/** Лимиты файлов личного дела из настроек центра (РМ94) — по образцу `GroupSettingsService`. */
@Injectable()
export class LearnerFilesSettingsService {
  constructor(@Optional() @Inject(TenantService) private readonly tenants?: TenantService) {}

  async forTenant(tenantId: string): Promise<LearnerFilesSettings> {
    if (!this.tenants) return DEFAULT_LEARNER_FILES_SETTINGS;
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return learnerFilesSettingsFrom(stored.payload);
    } catch {
      /* Настроек у центра может не быть — действуют значения по умолчанию. */
      return DEFAULT_LEARNER_FILES_SETTINGS;
    }
  }
}
