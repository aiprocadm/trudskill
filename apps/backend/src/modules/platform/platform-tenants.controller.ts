import { Body, Controller, Get, Inject, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';

import {
  ChangePlatformTenantStatusRequest,
  CreatePlatformTenantRequest,
  ImpersonatePlatformTenantRequest
} from './platform-tenants.dto.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { authCookie } from '../iam/auth-cookie.util.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { Response } from 'express';

/**
 * ФТ-D2.2 (Фаза 4 Task 3) — платформенная админка тенантов. Единственный контур,
 * которому положено видеть все тенанты, поэтому права `platform.tenants.*` выданы
 * только роли platform_admin (0073): tenant_admin арендатора сюда не попадает.
 */
@Controller('platform/tenants')
@UseGuards(TenantGuard)
export class PlatformTenantsController {
  constructor(@Inject(PlatformTenantsService) private readonly service: PlatformTenantsService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.read')
  list() {
    return this.service.listTenants();
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.write')
  create(@CurrentContext() c: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreatePlatformTenantRequest, body);
    return this.service.createTenant(c.userId, dto, c);
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.write')
  changeStatus(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const dto = assertValidDto(ChangePlatformTenantStatusRequest, body);
    return this.service.changeStatus(c.userId, id, dto.status, c);
  }

  // Отдельное право (0074): видеть список тенантов и входить в их кабинеты — разные
  // полномочия; аудит пишется ДО выдачи сессии в сервисе.
  // Срез 3: cookie ставятся как при обычном логине — без них сессия «от имени» из UI
  // живёт только TTL access-токена; refreshToken наружу ходит ТОЛЬКО cookie.
  @Post(':id/impersonate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.impersonate')
  async impersonate(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const dto = assertValidDto(ImpersonatePlatformTenantRequest, body ?? {});
    const result = await this.service.impersonate(c.userId, id, dto.userId, c);
    authCookie.attachRefreshAndCsrfCookies(
      response,
      result.session.refreshToken,
      result.session.csrfToken
    );
    return {
      tenantId: result.tenantId,
      userId: result.userId,
      session: authCookie.toPublicTokens(result.session)
    };
  }
}
