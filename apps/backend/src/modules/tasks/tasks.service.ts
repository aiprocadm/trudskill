import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';

import { TASKS_REPOSITORY } from './tasks.repository.js';
import { isAssignee, isParticipant, isTerminalStatus } from './tasks.types.js';
import { AuditService } from '../audit/audit.service.js';

import type {
  BulkTasksRequest,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  RescheduleTaskRequest,
  UpdateTaskRequest
} from './tasks.dto.js';
import type { TasksRepository } from './tasks.repository.js';
import type {
  StaffMember,
  Task,
  TaskActor,
  TaskAssignee,
  TaskBulkOutcome,
  TaskBulkRow,
  TaskComment,
  TaskListPage,
  TaskListQuery,
  TaskTransition
} from './tasks.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

export const TASKS_SETTINGS = Symbol('TASKS_SETTINGS');
export const TASKS_CLOCK = Symbol('TASKS_CLOCK');

export interface TasksSettings {
  /** §4: свой комментарий можно удалить в течение окна (по умолчанию 15 минут). */
  commentDeleteWindowMinutes: number;
}

export const DEFAULT_TASKS_SETTINGS: TasksSettings = { commentDeleteWindowMinutes: 15 };

export type Clock = () => Date;

const MANAGE_ALL = 'tasks.manage_all';
/** Выбор исполнителя — поиск по ФИО, а не полный список: 20 строк хватает, чтобы уточнить запрос. */
const STAFF_SEARCH_LIMIT = 20;

/**
 * Задачи сотрудников — правила §4 и §5.4 ТЗ перехода с CDOPROF.
 *
 * Кто что может (§5.4 МГ-G2.2):
 *   • исполнитель — «взять в работу» (`new → in_progress`) и «выполнить» (`in_progress → done`);
 *   • постановщик — «подтвердить» (`done → confirmed`) и «вернуть» (`done → in_progress`,
 *     комментарий обязателен), «отменить», перенести срок, править;
 *   • `tasks.manage_all` — видит и правит задачи всех сотрудников, переносит чужие сроки.
 *
 * Чужая задача (не участник без `manage_all`) отвечает `404 task_not_found`, а не 403: факт
 * существования задачи — тоже сведения. Недопустимый переход — `409
 * task_status_transition_invalid`; действие не тем, кому положено, — `403 task_action_forbidden`.
 *
 * Уведомления `task_*` (§11) — позиция 11 (РМ26); проверка принадлежности связанных объектов
 * центру — Фаза 1 (РМ27): пока они живут в JSON-снимке, читать который ради одной задачи
 * значило бы грузить 25 МБ.
 */
@Injectable()
export class TasksService {
  private readonly settings: TasksSettings;
  private readonly clock: Clock;

  constructor(
    @Inject(TASKS_REPOSITORY) private readonly repo: TasksRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(TASKS_SETTINGS) settings?: TasksSettings,
    @Optional() @Inject(TASKS_CLOCK) clock?: Clock
  ) {
    this.settings = settings ?? DEFAULT_TASKS_SETTINGS;
    this.clock = clock ?? (() => new Date());
  }

  actorOf(context: RequestContext): TaskActor {
    return {
      userId: context.userId ?? '',
      manageAll: (context.permissions ?? []).includes(MANAGE_ALL)
    };
  }

  async list(
    tenantId: string,
    context: RequestContext,
    query: TaskListQuery
  ): Promise<TaskListPage> {
    const actor = this.actorOf(context);
    if ((query.filter === 'all' || query.assignee) && !actor.manageAll) {
      throw new ForbiddenException({
        code: 'task_filter_all_forbidden',
        message: 'Смотреть задачи всех сотрудников может только тот, кто ими управляет'
      });
    }
    return this.repo.list(tenantId, actor, query);
  }

  async get(tenantId: string, context: RequestContext, id: string): Promise<Task> {
    const actor = this.actorOf(context);
    const task = await this.repo.getById(tenantId, id);
    if (!task || (!actor.manageAll && !isParticipant(task, actor.userId))) {
      throw new NotFoundException({ code: 'task_not_found', message: 'Задача не найдена' });
    }
    return task;
  }

  async create(
    tenantId: string,
    context: RequestContext,
    request: CreateTaskRequest
  ): Promise<Task> {
    const actor = this.actorOf(context);
    assertDates(request.startsAt, request.dueAt);
    const assigneeIds = unique(request.assigneeIds?.length ? request.assigneeIds : [actor.userId]);
    await this.assertStaff(tenantId, assigneeIds);
    const fileIds = unique(request.fileIds ?? []);
    await this.assertFiles(tenantId, fileIds);

    const now = this.now();
    const task: Task = {
      id: `task_${randomUUID().replace(/-/g, '')}`,
      tenantId,
      title: request.title.trim(),
      ...(request.description ? { description: request.description } : {}),
      status: 'new',
      priority: request.priority ?? 'normal',
      ...(request.label ? { label: request.label } : {}),
      ...(request.color ? { color: request.color } : {}),
      ...(request.startsAt ? { startsAt: request.startsAt } : {}),
      ...(request.dueAt ? { dueAt: request.dueAt } : {}),
      allDay: request.allDay ?? false,
      creatorUserId: actor.userId,
      links: compactLinks(request.links),
      ...(request.reminder
        ? {
            reminder: {
              minutesBefore: request.reminder.minutesBefore,
              channels: [...request.reminder.channels]
            }
          }
        : {}),
      assignees: assigneeIds.map((userId) => ({ userId, state: 'assigned', updatedAt: now })),
      fileIds,
      createdAt: now,
      updatedAt: now
    };
    await this.repo.insert(task);
    await this.audit(context, tenantId, 'tasks.task_created', task.id, undefined, task);
    return task;
  }

  async update(
    tenantId: string,
    context: RequestContext,
    id: string,
    request: UpdateTaskRequest
  ): Promise<Task> {
    const actor = this.actorOf(context);
    const task = await this.get(tenantId, context, id);
    if (task.creatorUserId !== actor.userId && !actor.manageAll) {
      throw new ForbiddenException({
        code: 'task_edit_forbidden',
        message: 'Править задачу может её постановщик'
      });
    }
    this.assertEditable(task);

    const startsAt = request.startsAt ?? task.startsAt;
    const dueAt = request.dueAt ?? task.dueAt;
    assertDates(startsAt, dueAt);

    let assignees: TaskAssignee[] = task.assignees;
    if (request.assigneeIds) {
      const ids = unique(request.assigneeIds);
      await this.assertStaff(tenantId, ids);
      const now = this.now();
      assignees = ids.map(
        (userId) =>
          task.assignees.find((a) => a.userId === userId) ?? {
            userId,
            state: 'assigned',
            updatedAt: now
          }
      );
    }
    let fileIds = task.fileIds;
    if (request.fileIds) {
      fileIds = unique(request.fileIds);
      await this.assertFiles(tenantId, fileIds);
    }

    const updated: Task = {
      ...task,
      ...(request.title !== undefined ? { title: request.title.trim() } : {}),
      ...(request.description !== undefined ? { description: request.description } : {}),
      ...(request.priority !== undefined ? { priority: request.priority } : {}),
      ...(request.label !== undefined ? { label: request.label } : {}),
      ...(request.color !== undefined ? { color: request.color } : {}),
      ...(startsAt ? { startsAt } : {}),
      ...(dueAt ? { dueAt } : {}),
      ...(request.allDay !== undefined ? { allDay: request.allDay } : {}),
      ...(request.links !== undefined ? { links: compactLinks(request.links) } : {}),
      ...(request.reminder !== undefined
        ? {
            reminder: {
              minutesBefore: request.reminder.minutesBefore,
              channels: [...request.reminder.channels]
            }
          }
        : {}),
      assignees,
      fileIds,
      updatedAt: this.now()
    };
    await this.repo.update(updated);
    await this.audit(context, tenantId, 'tasks.task_updated', task.id, task, updated);
    return updated;
  }

  async transition(
    tenantId: string,
    context: RequestContext,
    id: string,
    transition: TaskTransition,
    comment?: string
  ): Promise<Task> {
    const actor = this.actorOf(context);
    const task = await this.get(tenantId, context, id);
    const isAuthor = task.creatorUserId === actor.userId || actor.manageAll;
    const now = this.now();

    const rule = TRANSITIONS[transition];
    if (!rule.from.includes(task.status)) {
      throw new ConflictException({
        code: 'task_status_transition_invalid',
        message: `Из состояния «${STATUS_RU[task.status]}» нельзя: ${TRANSITION_RU[transition]}`
      });
    }
    const allowed = rule.who === 'assignee' ? isAssignee(task, actor.userId) : isAuthor;
    if (!allowed) {
      throw new ForbiddenException({
        code: 'task_action_forbidden',
        message:
          rule.who === 'assignee'
            ? 'Это действие доступно исполнителю задачи'
            : 'Это действие доступно постановщику задачи'
      });
    }
    if (transition === 'return' && !comment?.trim()) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Чтобы вернуть задачу, напишите исполнителю, что доработать'
      });
    }

    const assignees = task.assignees.map((a) => {
      if (transition === 'start' && a.userId === actor.userId)
        return { ...a, state: 'in_progress' as const, updatedAt: now };
      if (transition === 'complete' && a.userId === actor.userId)
        return { ...a, state: 'done' as const, updatedAt: now };
      if (transition === 'return') return { ...a, state: 'in_progress' as const, updatedAt: now };
      return a;
    });
    const updated: Task = {
      ...task,
      status: rule.to,
      assignees,
      ...(transition === 'complete' ? { doneAt: now } : {}),
      ...(transition === 'confirm' ? { confirmedAt: now } : {}),
      updatedAt: now
    };
    await this.repo.update(updated);
    if (comment?.trim()) {
      await this.repo.insertComment(
        this.buildComment(tenantId, task.id, actor.userId, comment.trim())
      );
    }
    await this.audit(
      context,
      tenantId,
      'tasks.task_status_changed',
      task.id,
      { status: task.status },
      {
        status: updated.status,
        transition
      }
    );
    return updated;
  }

  async reschedule(
    tenantId: string,
    context: RequestContext,
    id: string,
    request: RescheduleTaskRequest
  ): Promise<Task> {
    const actor = this.actorOf(context);
    const task = await this.get(tenantId, context, id);
    if (task.creatorUserId !== actor.userId && !actor.manageAll) {
      throw new ForbiddenException({
        code: 'task_reschedule_forbidden',
        message: 'Перенести срок может постановщик задачи'
      });
    }
    this.assertEditable(task);
    const startsAt = request.startsAt ?? task.startsAt;
    const dueAt = request.dueAt ?? task.dueAt;
    assertDates(startsAt, dueAt);
    const updated: Task = {
      ...task,
      ...(startsAt ? { startsAt } : {}),
      ...(dueAt ? { dueAt } : {}),
      updatedAt: this.now()
    };
    await this.repo.update(updated);
    if (request.comment?.trim()) {
      await this.repo.insertComment(
        this.buildComment(tenantId, task.id, actor.userId, request.comment.trim())
      );
    }
    await this.audit(
      context,
      tenantId,
      'tasks.task_rescheduled',
      task.id,
      { startsAt: task.startsAt, dueAt: task.dueAt },
      { startsAt: updated.startsAt, dueAt: updated.dueAt }
    );
    return updated;
  }

  async listComments(
    tenantId: string,
    context: RequestContext,
    id: string
  ): Promise<TaskComment[]> {
    await this.get(tenantId, context, id);
    return this.repo.listComments(tenantId, id);
  }

  async addComment(
    tenantId: string,
    context: RequestContext,
    id: string,
    request: CreateTaskCommentRequest
  ): Promise<TaskComment> {
    const actor = this.actorOf(context);
    const task = await this.get(tenantId, context, id);
    if (request.fileId) await this.assertFiles(tenantId, [request.fileId]);
    const comment = this.buildComment(
      tenantId,
      task.id,
      actor.userId,
      request.text.trim(),
      request.fileId
    );
    await this.repo.insertComment(comment);
    await this.audit(context, tenantId, 'tasks.comment_added', task.id, undefined, {
      commentId: comment.id
    });
    return comment;
  }

  async deleteComment(
    tenantId: string,
    context: RequestContext,
    id: string,
    commentId: string
  ): Promise<void> {
    const actor = this.actorOf(context);
    await this.get(tenantId, context, id);
    const comment = await this.repo.getComment(tenantId, id, commentId);
    if (!comment) {
      throw new NotFoundException({
        code: 'task_comment_not_found',
        message: 'Комментарий не найден'
      });
    }
    const ageMs = this.clock().getTime() - Date.parse(comment.createdAt);
    const windowMs = this.settings.commentDeleteWindowMinutes * 60_000;
    if (comment.authorUserId !== actor.userId || ageMs > windowMs) {
      throw new ForbiddenException({
        code: 'task_comment_delete_forbidden',
        message: `Удалить можно только свой комментарий и не позже чем через ${this.settings.commentDeleteWindowMinutes} мин`
      });
    }
    await this.repo.deleteComment(tenantId, id, commentId);
    await this.audit(context, tenantId, 'tasks.comment_deleted', id, { commentId }, undefined);
  }

  /** Сотрудники центра для выбора исполнителя; пустой запрос — первые по алфавиту. */
  searchStaff(tenantId: string, q: string): Promise<StaffMember[]> {
    return this.repo.searchStaff(tenantId, q.trim(), STAFF_SEARCH_LIMIT);
  }

  /** §16 `POST /tasks/bulk` — частичный успех: каждая строка отвечает за себя. */
  async bulk(
    tenantId: string,
    context: RequestContext,
    request: BulkTasksRequest
  ): Promise<TaskBulkOutcome> {
    const rows: TaskBulkRow[] = [];
    for (const taskId of unique(request.taskIds)) {
      try {
        if (request.action === 'reschedule') {
          await this.reschedule(tenantId, context, taskId, {
            ...(request.payload?.startsAt ? { startsAt: request.payload.startsAt } : {}),
            ...(request.payload?.dueAt ? { dueAt: request.payload.dueAt } : {}),
            ...(request.payload?.comment ? { comment: request.payload.comment } : {})
          });
        } else {
          await this.transition(
            tenantId,
            context,
            taskId,
            request.action,
            request.payload?.comment
          );
        }
        rows.push({ taskId, status: 'done' });
      } catch (error) {
        rows.push({ taskId, status: 'failed', error: errorOf(error) });
      }
    }
    const done = rows.filter((r) => r.status === 'done').length;
    return { total: rows.length, done, failed: rows.length - done, rows };
  }

  private assertEditable(task: Task): void {
    if (isTerminalStatus(task.status)) {
      throw new ConflictException({
        code: 'task_not_editable',
        message: `Задача уже ${STATUS_RU[task.status]} — менять её нельзя`
      });
    }
  }

  private async assertStaff(tenantId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const staff = new Set(await this.repo.findStaffUserIds(tenantId, userIds));
    const missing = userIds.filter((id) => !staff.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'task_assignee_not_staff',
        message: 'Исполнителем может быть только сотрудник центра'
      });
    }
  }

  private async assertFiles(tenantId: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    const existing = new Set(await this.repo.findExistingFileIds(tenantId, fileIds));
    if (fileIds.some((id) => !existing.has(id))) {
      throw new NotFoundException({ code: 'file_not_found', message: 'Файл не найден' });
    }
  }

  private buildComment(
    tenantId: string,
    taskId: string,
    authorUserId: string,
    text: string,
    fileId?: string
  ): TaskComment {
    return {
      id: `tcm_${randomUUID().replace(/-/g, '')}`,
      tenantId,
      taskId,
      authorUserId,
      text,
      ...(fileId ? { fileId } : {}),
      createdAt: this.now()
    };
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private async audit(
    context: RequestContext,
    tenantId: string,
    action: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown
  ): Promise<void> {
    await this.auditService.writeCritical({
      tenantId,
      actorId: context.userId,
      action,
      entityType: 'tasks.task',
      entityId,
      ...(oldValues ? { oldValues: oldValues as Record<string, unknown> } : {}),
      ...(newValues ? { newValues: newValues as Record<string, unknown> } : {}),
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
  }
}

const TRANSITIONS: Record<
  TaskTransition,
  { from: Task['status'][]; to: Task['status']; who: 'assignee' | 'author' }
> = {
  start: { from: ['new'], to: 'in_progress', who: 'assignee' },
  complete: { from: ['in_progress'], to: 'done', who: 'assignee' },
  confirm: { from: ['done'], to: 'confirmed', who: 'author' },
  return: { from: ['done'], to: 'in_progress', who: 'author' },
  cancel: { from: ['new', 'in_progress', 'done'], to: 'cancelled', who: 'author' }
};

const STATUS_RU: Record<Task['status'], string> = {
  new: 'новая',
  in_progress: 'в работе',
  done: 'выполнена',
  confirmed: 'подтверждена',
  cancelled: 'отменена'
};

const TRANSITION_RU: Record<TaskTransition, string> = {
  start: 'взять в работу',
  complete: 'выполнить',
  confirm: 'подтвердить',
  return: 'вернуть',
  cancel: 'отменить'
};

const assertDates = (startsAt: string | undefined, dueAt: string | undefined): void => {
  if (startsAt && dueAt && Date.parse(dueAt) < Date.parse(startsAt)) {
    throw new BadRequestException({
      code: 'validation_error',
      message: 'Срок задачи не может быть раньше её начала'
    });
  }
};

const unique = (ids: string[]): string[] => [
  ...new Set(ids.map((id) => id.trim()).filter(Boolean))
];

const compactLinks = (links: Task['links'] | undefined): Task['links'] => {
  if (!links) return {};
  const out: Task['links'] = {};
  for (const key of ['counterpartyId', 'contactId', 'groupId', 'learnerId', 'lessonId'] as const) {
    const value = links[key];
    if (value) out[key] = value;
  }
  return out;
};

const errorOf = (error: unknown): { code: string; message: string } => {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'code' in response) {
      const body = response as { code: string; message?: string };
      return { code: body.code, message: body.message ?? error.message };
    }
  }
  return {
    code: 'internal_error',
    message: error instanceof Error ? error.message : String(error)
  };
};
