import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { ImportCdoprofService } from './import-cdoprof.service.js';
import { ImportRowsQuery, StartImportRunRequest } from './import.request-dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../mvp/infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ТЗ перехода §16: импорт из CDOPROF. Все ручки — под `import.run` (0119, РМ21): и запуск, и
 * отчёт показывают данные будущих слушателей, поэтому смотреть их может только тот, кто
 * вправе переносить.
 */
@Controller('import/cdoprof')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class ImportCdoprofController {
  constructor(@Inject(ImportCdoprofService) private readonly service: ImportCdoprofService) {}

  @Post('runs')
  @UseGuards(PermissionGuard)
  @RequirePermissions('import.run')
  startRun(@Body() raw: unknown, @CurrentContext() c: RequestContext) {
    const request = assertValidDto(StartImportRunRequest, raw);
    return this.service.startRun(c.tenantId!, c.userId!, request, c);
  }

  @Get('runs')
  @UseGuards(PermissionGuard)
  @RequirePermissions('import.run')
  listRuns(@CurrentContext() c: RequestContext) {
    return this.service.listRuns(c.tenantId!);
  }

  @Get('runs/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('import.run')
  getRun(@Param('id') id: string, @CurrentContext() c: RequestContext) {
    return this.service.getRun(c.tenantId!, id);
  }

  @Post('runs/:id/retry-failed')
  @UseGuards(PermissionGuard)
  @RequirePermissions('import.run')
  retryFailed(@Param('id') id: string, @CurrentContext() c: RequestContext) {
    return this.service.retryFailed(c.tenantId!, c.userId!, id, c);
  }

  @Get('runs/:id/rows')
  @UseGuards(PermissionGuard)
  @RequirePermissions('import.run')
  listRows(@Param('id') id: string, @Query() raw: unknown, @CurrentContext() c: RequestContext) {
    const query = assertValidDto(ImportRowsQuery, raw);
    return this.service.listRows(c.tenantId!, id, query);
  }
}
