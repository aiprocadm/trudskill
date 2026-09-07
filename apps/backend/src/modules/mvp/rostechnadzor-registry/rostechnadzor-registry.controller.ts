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
import { UserDisplayNamesService } from '../../../common/iam/user-display-names.service.js';
import { DocumentsRequestPersistenceInterceptor } from '../../documents/infrastructure/documents-request-persistence.interceptor.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateRostechnadzorExportDto } from '../rostechnadzor-registry-export.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/*
 * Ревизия 2026-08-26 (порция 21): сервис читает выпущенные документы через
 * request-scoped `DocumentsService` — без его перехватчика выгрузка собиралась
 * поверх пустого состояния (найдено сторожем documents-state-wiring).
 */
@Controller('rostechnadzor-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor, DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class RostechnadzorRegistryController {
  constructor(
    @Inject(RostechnadzorRegistryService) private readonly service: RostechnadzorRegistryService,
    @Inject(UserDisplayNamesService)
    private readonly userNames: UserDisplayNamesService
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
  /*
   * §5.432: кто собрал выгрузку — видно человеку.
   *
   * Пакеты живут в снимке состояния центра, а не в таблице, поэтому имя не подставить
   * соединением, как в журнале действий: спрашиваем разом по всей странице (один запрос,
   * не по строке). Неизвестный идентификатор имени не даёт — экран скажет об этом прямо.
   */
  async listExports(@CurrentContext() ctx: RequestContext) {
    const batches = this.service.listBatches(ctx.tenantId!);
    const names = await this.userNames.namesOf(
      ctx.tenantId!,
      batches.map((batch) => batch.generatedBy)
    );
    return batches.map((batch) => ({
      ...batch,
      generatedByName: names.get(batch.generatedBy) ?? null
    }));
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
