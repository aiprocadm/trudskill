import { Controller, Get, UseGuards } from '@nestjs/common';

import { type TenantService } from './tenant.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('me')
  async me(@CurrentContext() context: RequestContext) {
    return this.tenantService.getTenantById(context.tenantId!);
  }

  @Get('settings')
  async settings(@CurrentContext() context: RequestContext) {
    return this.tenantService.getSettings(context.tenantId!);
  }

  @Get('requisites')
  async requisites(@CurrentContext() context: RequestContext) {
    return this.tenantService.getRequisites(context.tenantId!);
  }

  @Get('commission')
  async commission(@CurrentContext() context: RequestContext) {
    return this.tenantService.getCommission(context.tenantId!);
  }
}
