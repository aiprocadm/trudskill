import { Controller, Get, UseGuards } from '@nestjs/common';

import { type WorkspaceService } from './workspace.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller()
@UseGuards(TenantGuard, PermissionGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('workspace/summary')
  @RequirePermissions('tenant.read')
  getSummary(@CurrentContext() context: RequestContext) {
    return this.workspaceService.getWorkspaceSummary(context.tenantId!);
  }

  @Get('tasks/inbox')
  @RequirePermissions('tenant.read')
  getTasksInbox(@CurrentContext() context: RequestContext) {
    return { items: this.workspaceService.getTasksInbox(context.tenantId!) };
  }

  @Get('blockers')
  @RequirePermissions('tenant.read')
  getBlockers(@CurrentContext() context: RequestContext) {
    return { items: this.workspaceService.getBlockers(context.tenantId!) };
  }
}
