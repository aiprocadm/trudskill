import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { AuditService } from './audit.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('audit')
@UseGuards(TenantGuard, PermissionGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get('events')
  @RequirePermissions('auth.manage_sessions')
  async list(
    @CurrentContext() context: RequestContext,
    @Query('actor') actor?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('entity_id') entityId?: string,
    @Query('request_id') requestId?: string,
    @Query('created_from') createdFrom?: string,
    @Query('created_to') createdTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    /*
     * Фаза 6 Task 9: фильтры уехали в SQL.
     *
     * РАНЬШЕ здесь читался ВЕСЬ журнал центра, а отбор шёл в памяти — то есть поиск по
     * одному действию всё равно вытаскивал сотни тысяч строк. Экран открывался всё
     * дольше, а на большом объёме процесс просто съедал память.
     */
    return this.auditService.listPage(context.tenantId, {
      ...(actor ? { actor } : {}),
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(entityId ? { entityId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(offset ? { offset: Number(offset) } : {})
    });
  }
}
