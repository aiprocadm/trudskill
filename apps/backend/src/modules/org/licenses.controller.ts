import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { CreateLicenseRequest, UpdateLicenseRequest } from './licenses.dto.js';
import { LicensesService } from './licenses.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { LicenseStatus } from './licenses.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Pillar A Plan C §5.10 — REST API для лицензий учебного центра.
 * Все endpoints под TenantGuard + PermissionGuard.
 */
@Controller('admin/licenses')
@UseGuards(TenantGuard)
export class LicensesController {
  constructor(@Inject(LicensesService) private readonly service: LicensesService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('org.licenses.read')
  list(@CurrentContext() c: RequestContext, @Query('status') status?: LicenseStatus) {
    return { items: this.service.list(c.tenantId!, status) };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('org.licenses.read')
  get(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.service.get(c.tenantId!, id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('org.licenses.write')
  create(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateLicenseRequest, raw);
    return this.service.create(c.tenantId!, c.userId, b, c);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('org.licenses.write')
  update(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateLicenseRequest, raw);
    return this.service.update(c.tenantId!, c.userId, id, b, c);
  }

  @Post(':id/revoke')
  @UseGuards(PermissionGuard)
  @RequirePermissions('org.licenses.write')
  revoke(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.service.revoke(c.tenantId!, c.userId, id, c);
  }
}
