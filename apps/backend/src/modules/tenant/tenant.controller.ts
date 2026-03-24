import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../common/context/request-context.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenantService } from './tenant.service.js';

@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('me')
  me(@CurrentContext() context: RequestContext) {
    return this.tenantService.getTenantById(context.tenantId!);
  }

  @Get('settings')
  settings(@CurrentContext() context: RequestContext) {
    return this.tenantService.getSettings(context.tenantId!);
  }

  @Get('requisites')
  requisites(@CurrentContext() context: RequestContext) {
    return this.tenantService.getRequisites(context.tenantId!);
  }
}
