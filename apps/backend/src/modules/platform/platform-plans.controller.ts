import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { AssignPlanRequest, CreatePlatformPlanRequest } from './platform-plans.dto.js';
import { PlatformPlansService } from './platform-plans.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ФТ-D4 (Фаза 4 Task 5): тарифы платформы. Отдельного права не заводим:
 * тарифы — часть управления арендаторами (platform.tenants.*), выданного
 * только platform_admin (0073).
 */
@Controller('platform')
@UseGuards(TenantGuard)
export class PlatformPlansController {
  constructor(@Inject(PlatformPlansService) private readonly service: PlatformPlansService) {}

  @Get('plans')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.read')
  list() {
    return this.service.listPlans();
  }

  @Post('plans')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.write')
  create(@CurrentContext() c: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreatePlatformPlanRequest, body);
    const { code, name, activeLearnersLimit, staffLimit, storageLimitBytes, ...features } = dto;
    return this.service.createPlan(
      c.userId,
      {
        code,
        name,
        activeLearnersLimit: activeLearnersLimit ?? null,
        staffLimit: staffLimit ?? null,
        storageLimitBytes: storageLimitBytes ?? null,
        features
      },
      c
    );
  }

  @Post('tenants/:id/plan')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.write')
  assign(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() body: unknown) {
    const dto = assertValidDto(AssignPlanRequest, body);
    return this.service.assignPlan(c.userId, id, dto.planId, c);
  }
}
