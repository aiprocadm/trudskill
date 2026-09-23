import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import {
  BulkTasksRequest,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  RescheduleTaskRequest,
  TaskTransitionRequest,
  UpdateTaskRequest
} from './tasks.dto.js';
import { TasksService } from './tasks.service.js';
import { TASK_LIST_FILTERS } from './tasks.types.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { TaskListFilter, TaskListQuery } from './tasks.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/** Решение Р16: страница списка — 50 по умолчанию, не больше 200 с проволоки. */
const LIST_PAGE_SIZE = 50;
const LIST_PAGE_SIZE_MAX = 200;
const ENTITY_TYPES = ['counterparty', 'contact', 'group', 'learner', 'lesson'] as const;

/**
 * Ручки §16 ТЗ перехода с CDOPROF. Все — под `TenantGuard` и `PermissionGuard`.
 *
 * `GET /tasks/inbox` живёт в `WorkspaceController` (входящие по документам) и объявлен раньше:
 * `WorkspaceModule` — в базовых модулях, этот — в доменных; статический путь регистрируется
 * первым и `:id` его не перекрывает (проверяется HTTP-тестом).
 *
 * Комментарии пишутся под `tasks.write`, а не `tasks.read` из §16 (решение РМ24): сторож
 * `mutation-under-read-permission` не даёт изменять данные под правом «смотреть».
 */
@Controller('tasks')
@UseGuards(TenantGuard, PermissionGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly service: TasksService) {}

  @Get()
  @RequirePermissions('tasks.read')
  list(@CurrentContext() c: RequestContext, @Query() query: Record<string, string | undefined>) {
    return this.service.list(c.tenantId!, c, parseListQuery(query));
  }

  @Post()
  @RequirePermissions('tasks.write')
  create(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    return this.service.create(c.tenantId!, c, assertValidDto(CreateTaskRequest, raw));
  }

  @Post('bulk')
  @RequirePermissions('tasks.write')
  bulk(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    return this.service.bulk(c.tenantId!, c, assertValidDto(BulkTasksRequest, raw));
  }

  /** Выбор исполнителя: под `tasks.write` — тем, кто ставит задачи; статический путь выше `:id`. */
  @Get('staff')
  @RequirePermissions('tasks.write')
  async searchStaff(@CurrentContext() c: RequestContext, @Query('q') q = '') {
    return { items: await this.service.searchStaff(c.tenantId!, String(q ?? '')) };
  }

  @Get(':id')
  @RequirePermissions('tasks.read')
  get(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.service.get(c.tenantId!, c, id);
  }

  @Patch(':id')
  @RequirePermissions('tasks.write')
  update(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    return this.service.update(c.tenantId!, c, id, assertValidDto(UpdateTaskRequest, raw));
  }

  @Post(':id/start')
  @RequirePermissions('tasks.write')
  start(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(TaskTransitionRequest, raw ?? {});
    return this.service.transition(c.tenantId!, c, id, 'start', b.comment);
  }

  @Post(':id/complete')
  @RequirePermissions('tasks.write')
  complete(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(TaskTransitionRequest, raw ?? {});
    return this.service.transition(c.tenantId!, c, id, 'complete', b.comment);
  }

  @Post(':id/confirm')
  @RequirePermissions('tasks.write')
  confirm(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(TaskTransitionRequest, raw ?? {});
    return this.service.transition(c.tenantId!, c, id, 'confirm', b.comment);
  }

  @Post(':id/return')
  @RequirePermissions('tasks.write')
  return(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(TaskTransitionRequest, raw ?? {});
    return this.service.transition(c.tenantId!, c, id, 'return', b.comment);
  }

  @Post(':id/cancel')
  @RequirePermissions('tasks.write')
  cancel(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(TaskTransitionRequest, raw ?? {});
    return this.service.transition(c.tenantId!, c, id, 'cancel', b.comment);
  }

  @Post(':id/reschedule')
  @RequirePermissions('tasks.write')
  reschedule(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    return this.service.reschedule(c.tenantId!, c, id, assertValidDto(RescheduleTaskRequest, raw));
  }

  @Get(':id/comments')
  @RequirePermissions('tasks.read')
  async listComments(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return { items: await this.service.listComments(c.tenantId!, c, id) };
  }

  @Post(':id/comments')
  @RequirePermissions('tasks.write')
  addComment(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    return this.service.addComment(
      c.tenantId!,
      c,
      id,
      assertValidDto(CreateTaskCommentRequest, raw)
    );
  }

  @Delete(':id/comments/:commentId')
  @RequirePermissions('tasks.write')
  async deleteComment(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Param('commentId') commentId: string
  ) {
    await this.service.deleteComment(c.tenantId!, c, id, commentId);
    return { deleted: true };
  }
}

/**
 * Параметры списка приходят строками (§16: `filter, assignee, due_from/to, label,
 * entity_type/id, page, page_size`). Неизвестный отбор — 400, а не молчаливое умолчание.
 */
export const parseListQuery = (query: Record<string, string | undefined>): TaskListQuery => {
  const filter = (query.filter ?? 'assigned_to_me') as TaskListFilter;
  if (!TASK_LIST_FILTERS.includes(filter)) {
    throw new BadRequestException({
      code: 'validation_error',
      message: `Неизвестный отбор задач: ${query.filter}`
    });
  }
  const entityType = query.entity_type as (typeof ENTITY_TYPES)[number] | undefined;
  if (entityType && !ENTITY_TYPES.includes(entityType)) {
    throw new BadRequestException({
      code: 'validation_error',
      message: `Неизвестный тип связанного объекта: ${query.entity_type}`
    });
  }
  const page = positiveInt(query.page, 1);
  const pageSize = Math.min(LIST_PAGE_SIZE_MAX, positiveInt(query.page_size, LIST_PAGE_SIZE));
  return {
    filter,
    ...(query.assignee ? { assignee: query.assignee } : {}),
    ...(query.due_from ? { dueFrom: query.due_from } : {}),
    ...(query.due_to ? { dueTo: query.due_to } : {}),
    ...(query.label ? { label: query.label } : {}),
    ...(entityType && query.entity_id ? { entityType, entityId: query.entity_id } : {}),
    page,
    pageSize
  };
};

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return raw !== undefined && Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
};
