import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { WorkspaceService } from './workspace.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Рабочий стол сотрудника: сводка, входящие задачи, блокеры. Право `workspace.read`
 * (миграция 0091) — у всех ролей центра, кроме слушателя. Прежде стояло `tenant.read`, а оно
 * есть и у слушателя: он видел черновики курсов, задачи по документам и сбои выдачи всего
 * центра (журнал 342, 343).
 */
@Controller()
@UseGuards(TenantGuard, PermissionGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly workspaceService: WorkspaceService) {}

  @Get('workspace/summary')
  @RequirePermissions('workspace.read')
  getSummary(@CurrentContext() context: RequestContext) {
    return this.workspaceService.getWorkspaceSummary(context.tenantId!);
  }

  @Get('tasks/inbox')
  @RequirePermissions('workspace.read')
  async getTasksInbox(@CurrentContext() context: RequestContext) {
    // БЕЗ `await` сюда попадал бы Promise: в JSON он превращается в пустой объект `{}`,
    // и экран падал с «filter is not a function» — список ждали, а получали объект.
    return { items: await this.workspaceService.getTasksInbox(context.tenantId!) };
  }

  @Get('blockers')
  @RequirePermissions('workspace.read')
  async getBlockers(@CurrentContext() context: RequestContext) {
    return { items: await this.workspaceService.getBlockers(context.tenantId!) };
  }
}
