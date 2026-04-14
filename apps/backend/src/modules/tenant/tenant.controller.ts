import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';

import { TenantService } from './tenant.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantController {
  constructor(@Inject(TenantService) private readonly tenantService: TenantService) {}

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

  @Put('settings')
  async updateSettings(
    @CurrentContext() context: RequestContext,
    @Body() body: { locale?: string; timezone?: string; payload?: Record<string, unknown> }
  ) {
    return this.tenantService.updateSettings(context.tenantId!, body);
  }

  @Put('requisites')
  async updateRequisites(
    @CurrentContext() context: RequestContext,
    @Body() body: { legalName?: string; taxNumber?: string; payload?: Record<string, unknown> }
  ) {
    return this.tenantService.updateRequisites(context.tenantId!, body);
  }

  @Get('commission')
  async commission(@CurrentContext() context: RequestContext) {
    return this.tenantService.getCommission(context.tenantId!);
  }
}
