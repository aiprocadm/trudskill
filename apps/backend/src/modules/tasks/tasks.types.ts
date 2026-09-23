/**
 * Задачи сотрудников (ТЗ перехода с CDOPROF §4, §5.4, §16) — замена «календаря задач» CDOPROF.
 *
 * Доменная модель живёт в нормализованных таблицах `tasks.*` (миграция 0101), а не в
 * JSON-снимке центра: спайк позиции 3 показал, что снимок не выдерживает объём CDOPROF
 * (docs/LOAD_TEST_RESULTS.md, 2026-09-23). Даты — ISO-строки, как везде в домене.
 */
export const TASK_STATUSES = ['new', 'in_progress', 'done', 'confirmed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_ASSIGNEE_STATES = ['assigned', 'in_progress', 'done'] as const;
export type TaskAssigneeState = (typeof TASK_ASSIGNEE_STATES)[number];

/** Переходы по §4: «взять в работу», «выполнить», «подтвердить», «вернуть», «отменить». */
export const TASK_TRANSITIONS = ['start', 'complete', 'confirm', 'return', 'cancel'] as const;
export type TaskTransition = (typeof TASK_TRANSITIONS)[number];

/** Отборы реестра по §16: `all` — только с `tasks.manage_all`. */
export const TASK_LIST_FILTERS = [
  'assigned_to_me',
  'created_by_me',
  'overdue',
  'done',
  'all'
] as const;
export type TaskListFilter = (typeof TASK_LIST_FILTERS)[number];

/** Действия массовой операции `POST /tasks/bulk` (§16). */
export const TASK_BULK_ACTIONS = ['complete', 'confirm', 'cancel', 'reschedule'] as const;
export type TaskBulkAction = (typeof TASK_BULK_ACTIONS)[number];

/** Привязка задачи к объектам центра. Существование объектов проверит Фаза 1 (РМ27). */
export interface TaskLinks {
  counterpartyId?: string;
  contactId?: string;
  groupId?: string;
  learnerId?: string;
  lessonId?: string;
}

export interface TaskReminder {
  minutesBefore: number;
  channels: string[];
}

export interface TaskAssignee {
  userId: string;
  /** ФИО из `iam.users.display_name`: экран показывает людей, а не идентификаторы. */
  name?: string;
  state: TaskAssigneeState;
  updatedAt: string;
}

/** Сотрудник центра для выбора исполнителя (`GET /tasks/staff`). */
export interface StaffMember {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  label?: string;
  color?: string;
  startsAt?: string;
  dueAt?: string;
  allDay: boolean;
  creatorUserId: string;
  creatorName?: string;
  links: TaskLinks;
  reminder?: TaskReminder;
  doneAt?: string;
  confirmedAt?: string;
  archivedAt?: string;
  assignees: TaskAssignee[];
  fileIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  tenantId: string;
  taskId: string;
  authorUserId: string;
  authorName?: string;
  text: string;
  fileId?: string;
  createdAt: string;
}

export interface TaskListQuery {
  filter: TaskListFilter;
  /** Сотрудник, чьи задачи смотреть; только с `tasks.manage_all`. */
  assignee?: string;
  dueFrom?: string;
  dueTo?: string;
  label?: string;
  entityType?: 'counterparty' | 'contact' | 'group' | 'learner' | 'lesson';
  entityId?: string;
  page: number;
  pageSize: number;
}

export interface TaskListPage {
  items: Task[];
  page: number;
  pageSize: number;
  total: number;
}

/** «Кто спрашивает» для отбора и проверок «своё / чужое». */
export interface TaskActor {
  userId: string;
  manageAll: boolean;
}

export interface TaskBulkRow {
  taskId: string;
  status: 'done' | 'failed';
  error?: { code: string; message: string };
}

export interface TaskBulkOutcome {
  total: number;
  done: number;
  failed: number;
  rows: TaskBulkRow[];
}

export const isTerminalStatus = (status: TaskStatus): boolean =>
  status === 'confirmed' || status === 'cancelled';

export const isParticipant = (task: Task, userId: string): boolean =>
  task.creatorUserId === userId || task.assignees.some((a) => a.userId === userId);

export const isAssignee = (task: Task, userId: string): boolean =>
  task.assignees.some((a) => a.userId === userId);
