import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';

import { FrdoRegistryService } from './frdo-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { CreateFrdoRegistryExportDto } from '../frdo-registry-export.dto.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('frdo-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class FrdoRegistryController {
  constructor(private readonly service: FrdoRegistryService) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateFrdoRegistryExportDto, body);
    return this.service.exportFrdoRegistry(ctx.tenantId!, dto, ctx);
  }

  @Get('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  listExports(@CurrentContext() ctx: RequestContext) {
    return this.service.listBatches(ctx.tenantId!);
  }

  @Get('exports/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  getExport(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchWithRecords(ctx.tenantId!, id);
  }

  @Get('exports/:id/file')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  async getFile(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchDownloadUrl(ctx.tenantId!, id);
  }
}
