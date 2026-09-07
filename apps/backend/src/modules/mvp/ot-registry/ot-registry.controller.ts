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

import { OtRegistryService } from './ot-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { UserDisplayNamesService } from '../../../common/iam/user-display-names.service.js';
import { DocumentsRequestPersistenceInterceptor } from '../../documents/infrastructure/documents-request-persistence.interceptor.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateOtRegistryExportDto } from '../ot-registry-export.dto.js';
import { ImportOtRegistryResponseDto } from '../ot-registry-import.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/*
 * Ревизия 2026-08-26 (порция 21): сервис читает протоколы через request-scoped
 * `DocumentsService`, чьё состояние грузит только его собственный перехватчик.
 * Без него выгрузка уходила в реестр с пустыми номером и датой протокола — тихо.
 */
@Controller('ot-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor, DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class OtRegistryController {
  constructor(
    @Inject(OtRegistryService) private readonly service: OtRegistryService,
    @Inject(UserDisplayNamesService)
    private readonly userNames: UserDisplayNamesService
  ) {}

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
