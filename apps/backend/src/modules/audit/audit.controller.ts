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
    @Query('created_to') createdTo?: string
  ) {
    const rows = await this.auditService.list(context.tenantId);
    return {
      items: rows.filter((row) => {
        if (actor && !row.actorId?.includes(actor)) return false;
        if (entity && !row.entityType.includes(entity)) return false;
        if (action && !row.action.includes(action)) return false;
        if (entityId && !row.entityId?.includes(entityId)) return false;
        if (requestId && !row.requestId?.includes(requestId)) return false;
        if (createdFrom && new Date(row.createdAt).getTime() < new Date(createdFrom).getTime())
          return false;
        if (createdTo && new Date(row.createdAt).getTime() > new Date(createdTo).getTime())
          return false;
        return true;
      })
    };
  }
}
