export const tasksContractGroup = {
  tag: 'async.tasks.files',
  description: 'Async tasks and file processing contract group skeleton.'
} as const;

/**
 * Задачи сотрудников (ТЗ перехода с CDOPROF §4, §16) — `GET/POST /tasks`, `/tasks/:id`,
 * переходы, комментарии, `/tasks/bulk`. Имена `StaffTask*`: `Task*` в этом пакете уже занято
 * фоновыми задачами выше.
 */
export const STAFF_TASK_STATUSES = [
  'new',
  'in_progress',
  'done',
  'confirmed',
  'cancelled'
] as const;
export type StaffTaskStatus = (typeof STAFF_TASK_STATUSES)[number];

export const STAFF_TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type StaffTaskPriority = (typeof STAFF_TASK_PRIORITIES)[number];

export const STAFF_TASK_LIST_FILTERS = [
  'assigned_to_me',
  'created_by_me',
  'overdue',
  'done',
  'all'
] as const;
export type StaffTaskListFilter = (typeof STAFF_TASK_LIST_FILTERS)[number];

export interface StaffTaskAssigneeContract {
  userId: string;
  /** ФИО сотрудника — экран показывает людей, а не идентификаторы. */
  name?: string;
  state: 'assigned' | 'in_progress' | 'done';
  updatedAt: string;
}

/** Сотрудник центра для выбора исполнителя (`GET /tasks/staff?q=`). */
export interface StaffMemberContract {
  id: string;
  name: string;
}

export interface StaffTaskLinksContract {
  counterpartyId?: string;
  contactId?: string;
  groupId?: string;
  learnerId?: string;
  lessonId?: string;
}

export interface StaffTaskContract {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  status: StaffTaskStatus;
  priority: StaffTaskPriority;
  label?: string;
  color?: string;
  startsAt?: string;
  dueAt?: string;
  allDay: boolean;
  creatorUserId: string;
  creatorName?: string;
  links: StaffTaskLinksContract;
  reminder?: { minutesBefore: number; channels: string[] };
  doneAt?: string;
  confirmedAt?: string;
  assignees: StaffTaskAssigneeContract[];
  fileIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StaffTaskCommentContract {
  id: string;
  taskId: string;
  authorUserId: string;
  authorName?: string;
  text: string;
  fileId?: string;
  createdAt: string;
}

export interface StaffTaskListContract {
  items: StaffTaskContract[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StaffTaskBulkRowContract {
  taskId: string;
  status: 'done' | 'failed';
  error?: { code: string; message: string };
}

export interface StaffTaskBulkOutcomeContract {
  total: number;
  done: number;
  failed: number;
  rows: StaffTaskBulkRowContract[];
}
