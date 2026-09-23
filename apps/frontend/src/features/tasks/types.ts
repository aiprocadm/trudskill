import type {
  StaffTaskBulkOutcomeContract,
  StaffTaskCommentContract,
  StaffTaskContract,
  StaffTaskListContract,
  StaffTaskListFilter,
  StaffTaskPriority,
  StaffTaskStatus
} from '@trudskill/api-contracts';

/** Задачи сотрудников (ТЗ перехода с CDOPROF §4, §5.4, §16) — типы экрана поверх контракта. */
export type Task = StaffTaskContract;
export type TaskComment = StaffTaskCommentContract;
export type TaskStatus = StaffTaskStatus;
export type TaskPriority = StaffTaskPriority;
export type TaskListFilter = StaffTaskListFilter;
export type TasksListResponse = StaffTaskListContract;
export type TaskBulkOutcome = StaffTaskBulkOutcomeContract;

export interface TasksListFilters {
  filter: TaskListFilter;
  assignee?: string;
  dueFrom?: string;
  dueTo?: string;
  label?: string;
  page: number;
  pageSize: number;
}

export interface TaskLinksPayload {
  counterpartyId?: string;
  contactId?: string;
  groupId?: string;
  learnerId?: string;
  lessonId?: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigneeIds?: string[];
  startsAt?: string;
  dueAt?: string;
  allDay?: boolean;
  priority?: TaskPriority;
  label?: string;
  color?: string;
  links?: TaskLinksPayload;
}

export type UpdateTaskPayload = Partial<CreateTaskPayload>;

export type TaskTransition = 'start' | 'complete' | 'confirm' | 'return' | 'cancel';

export interface StaffMember {
  id: string;
  name: string;
}

/** Русские подписи статусов — §9 TXT: одно слово на одно состояние. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Выполнена',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена'
};

/** Статус → семантический тон `StatusChip` (только из словаря тонов пакета UI). */
export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  new: 'pending',
  in_progress: 'running',
  done: 'completed',
  confirmed: 'completed',
  cancelled: 'cancelled'
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий'
};

/** Быстрые отборы §5.4 G2.3; «Все» показывается только с `tasks.manage_all`. */
export const TASK_FILTER_LABEL: Record<TaskListFilter, string> = {
  assigned_to_me: 'Поставленные мне',
  created_by_me: 'Поставленные мною',
  overdue: 'Просроченные',
  done: 'Выполненные',
  all: 'Все'
};
