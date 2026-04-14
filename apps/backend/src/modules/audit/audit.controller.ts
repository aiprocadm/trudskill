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
    @Query('action') action?: string
  ) {
    const rows = await this.auditService.list(context.tenantId);
    return {
      items: rows.filter((row) => {
        if (actor && !row.actorId?.includes(actor)) return false;
        if (entity && !row.entityType.includes(entity)) return false;
        if (action && !row.action.includes(action)) return false;
        return true;
      })
    };
  }
}
