import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import {
  BACKGROUND_TASK_KIND_LABEL,
  BACKGROUND_TASK_STATUS_LABEL
} from './background-task.types.js';
import { BackgroundTasksService } from './background-tasks.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Раздел «Фоновые задачи» (ТЗ 12.2; название — по правилу 4.2, никаких «джобов»).
 *
 * Отдельного права нет намеренно: человек видит СВОИ долгие операции, а не чужие. Заводить
 * право «смотреть фоновые задачи» значило бы, что кто-то может его не иметь и тогда отправит
 * задачу, о судьбе которой не узнает.
 */
@Controller('background-tasks')
@UseGuards(TenantGuard)
export class BackgroundTasksController {
  constructor(@Inject(BackgroundTasksService) private readonly service: BackgroundTasksService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    const all = await this.service.list(ctx.tenantId!);
    /* Свои задачи. Задачи без автора (поставленные системой) видны всем: скрывать их не от кого. */
    const items = all.filter((task) => !task.createdBy || task.createdBy === ctx.userId);
    return { items };
  }

  /**
   * Словарь подписей отдаётся вместе с данными.
   *
   * Иначе экран завёл бы свой второй словарь, и однажды «Не выполнена» на экране разошлось бы с
   * «Не выполнена» в письме — при том, что состояние одно и то же.
   */
  @Get('labels')
  labels() {
    return { statuses: BACKGROUND_TASK_STATUS_LABEL, kinds: BACKGROUND_TASK_KIND_LABEL };
  }
}
