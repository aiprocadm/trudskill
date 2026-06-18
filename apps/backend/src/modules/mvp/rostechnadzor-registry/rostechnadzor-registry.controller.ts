import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { RostechnadzorRegistryService } from './rostechnadzor-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateRostechnadzorExportDto } from '../rostechnadzor-registry-export.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('rostechnadzor-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class RostechnadzorRegistryController {
  constructor(
    @Inject(RostechnadzorRegistryService) private readonly service: RostechnadzorRegistryService
  ) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateRostechnadzorExportDto, body);
    return this.service.exportRostechnadzorRegistry(ctx.tenantId!, dto, ctx);
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

  @Get('exports/:id/signature')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  async getSignature(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchSignatureUrl(ctx.tenantId!, id);
  }
}
