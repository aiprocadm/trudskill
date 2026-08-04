import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { TenantOnboardingService } from './tenant-onboarding.service.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * ФТ-D2.3: статус онбординга центра. Право `tenant.read` — видеть, что уже настроено,
 * безобидно для любого сотрудника; каждый шаг записывается СВОИМ правом (реквизиты,
 * лицензии, бренд, комиссии, шаблоны, курсы) на своих экранах — мастер их не дублирует.
 */
@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantOnboardingController {
  constructor(
    @Inject(TenantOnboardingService) private readonly onboarding: TenantOnboardingService
  ) {}

  @Get('onboarding')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.read')
  getStatus(@CurrentContext() c: RequestContext) {
    return this.onboarding.getStatus(c.tenantId!);
  }
}
