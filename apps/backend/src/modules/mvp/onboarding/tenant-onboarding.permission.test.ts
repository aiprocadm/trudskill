import { describe, expect, it } from 'vitest';

import { TenantOnboardingController } from './tenant-onboarding.controller.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';

/**
 * Ход настройки центра — под правом администрации, а не под `tenant.read` (журнал 343).
 *
 * `tenant.read` есть у каждой роли, включая слушателя, — под ним слушатель видел, какие
 * шаги настройки центра сделаны, а какие нет. Настройка центра — дело его администрации:
 * то же право, что у реквизитов (`PUT /tenant/requisites`) и у экрана `/onboarding`.
 */
describe('TenantOnboardingController — статус настройки центра закрыт правом администрации', () => {
  it('getStatus требует tenant.settings.write', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, TenantOnboardingController.prototype.getStatus)
    ).toEqual(['tenant.settings.write']);
  });
});
