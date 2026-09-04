import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { TenantOnboardingService } from './tenant-onboarding.service.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * ФТ-D2.3: статус онбординга центра. Настройка центра — дело его администрации, поэтому
 * право — то же, что у реквизитов (`tenant.settings.write`, 0083) и у экрана `/onboarding`.
 * Прежде стояло `tenant.read` «безобидно для любого сотрудника» — но оно есть и у
 * слушателя, и он видел ход настройки центра (журнал 343). Каждый шаг записывается СВОИМ
 * правом (реквизиты, лицензии, бренд, комиссии, шаблоны, курсы) на своих экранах — мастер
 * их не дублирует.
 */
@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantOnboardingController {
  constructor(
    @Inject(TenantOnboardingService) private readonly onboarding: TenantOnboardingService
  ) {}

  @Get('onboarding')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.settings.write')
  getStatus(@CurrentContext() c: RequestContext) {
    return this.onboarding.getStatus(c.tenantId!);
  }
}
