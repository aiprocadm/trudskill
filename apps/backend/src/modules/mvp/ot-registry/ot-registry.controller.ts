import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';

import { OtRegistryService } from './ot-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateOtRegistryExportDto } from '../ot-registry-export.dto.js';
import { ImportOtRegistryResponseDto } from '../ot-registry-import.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('ot-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class OtRegistryController {
  constructor(private readonly service: OtRegistryService) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateOtRegistryExportDto, body);
    return this.service.exportOtRegistry(ctx.tenantId!, dto, ctx);
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

  @Post('exports/:id/registry-response')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async importResponse(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const dto = assertValidDto(ImportOtRegistryResponseDto, body);
    return this.service.importRegistryResponse(ctx.tenantId!, id, dto.fileBase64, ctx);
  }
}
