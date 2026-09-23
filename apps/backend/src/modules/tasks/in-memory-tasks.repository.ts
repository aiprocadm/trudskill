import type { TasksRepository } from './tasks.repository.js';
import type { Task, TaskActor, TaskComment, TaskListPage, TaskListQuery } from './tasks.types.js';

/**
 * Хранилище задач в памяти — для тестов сервиса и HTTP-границы.
 *
 * Повторяет семантику Postgres-реализации: отбор по центру, по участию («свои» — где я автор
 * или исполнитель; «все» — только с `manageAll`), сортировка по сроку с полным порядком
 * (срок, создание, id). Сотрудники и файлы центра задаются снаружи — так тест говорит, кто
 * «свой», без базы.
 */
export class InMemoryTasksRepository implements TasksRepository {
  private readonly tasks = new Map<string, Task>();
  private readonly comments = new Map<string, TaskComment>();

  constructor(
    private readonly staff: Record<string, string[]> = {},
    private readonly files: Record<string, string[]> = {}
  ) {}

  async list(tenantId: string, actor: TaskActor, query: TaskListQuery): Promise<TaskListPage> {
    const now = Date.now();
    const mine = (t: Task) =>
      t.creatorUserId === actor.userId || t.assignees.some((a) => a.userId === actor.userId);
    let items = [...this.tasks.values()].filter((t) => t.tenantId === tenantId && !t.archivedAt);
    switch (query.filter) {
      case 'assigned_to_me':
        items = items.filter((t) => t.assignees.some((a) => a.userId === actor.userId));
        break;
      case 'created_by_me':
        items = items.filter((t) => t.creatorUserId === actor.userId);
        break;
      case 'overdue':
        items = items.filter(
          (t) =>
            (actor.manageAll || mine(t)) &&
            (t.status === 'new' || t.status === 'in_progress') &&
            !!t.dueAt &&
            Date.parse(t.dueAt) < now
        );
        break;
      case 'done':
        items = items.filter(
          (t) => (actor.manageAll || mine(t)) && (t.status === 'done' || t.status === 'confirmed')
        );
        break;
      case 'all':
        break;
    }
    if (query.assignee) {
      items = items.filter((t) => t.assignees.some((a) => a.userId === query.assignee));
    }
    if (query.dueFrom) items = items.filter((t) => !!t.dueAt && t.dueAt >= query.dueFrom!);
    if (query.dueTo) items = items.filter((t) => !!t.dueAt && t.dueAt <= query.dueTo!);
    if (query.label) items = items.filter((t) => t.label === query.label);
    if (query.entityType && query.entityId) {
      const key = `${query.entityType}Id` as keyof Task['links'];
      items = items.filter((t) => t.links[key] === query.entityId);
    }
    items.sort(
      (a, b) =>
        (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id)
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize).map(clone),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length
    };
  }

  async getById(tenantId: string, id: string): Promise<Task | null> {
    const task = this.tasks.get(id);
    return task && task.tenantId === tenantId ? clone(task) : null;
  }

  async insert(task: Task): Promise<Task> {
    this.tasks.set(task.id, clone(task));
    return clone(task);
  }

  async update(task: Task): Promise<Task> {
    this.tasks.set(task.id, clone(task));
    return clone(task);
  }

  async listComments(tenantId: string, taskId: string): Promise<TaskComment[]> {
    return [...this.comments.values()]
      .filter((c) => c.tenantId === tenantId && c.taskId === taskId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((c) => ({ ...c }));
  }

  async getComment(
    tenantId: string,
    taskId: string,
    commentId: string
  ): Promise<TaskComment | null> {
    const comment = this.comments.get(commentId);
    return comment && comment.tenantId === tenantId && comment.taskId === taskId
      ? { ...comment }
      : null;
  }

  async insertComment(comment: TaskComment): Promise<TaskComment> {
    this.comments.set(comment.id, { ...comment });
    return { ...comment };
  }

  async deleteComment(tenantId: string, taskId: string, commentId: string): Promise<void> {
    const comment = this.comments.get(commentId);
    if (comment && comment.tenantId === tenantId && comment.taskId === taskId) {
      this.comments.delete(commentId);
    }
  }

  async findStaffUserIds(tenantId: string, userIds: string[]): Promise<string[]> {
    const staff = new Set(this.staff[tenantId] ?? []);
    return userIds.filter((id) => staff.has(id));
  }

  async findExistingFileIds(tenantId: string, fileIds: string[]): Promise<string[]> {
    const files = new Set(this.files[tenantId] ?? []);
    return fileIds.filter((id) => files.has(id));
  }
}

const clone = (task: Task): Task => ({
  ...task,
  links: { ...task.links },
  ...(task.reminder
    ? { reminder: { ...task.reminder, channels: [...task.reminder.channels] } }
    : {}),
  assignees: task.assignees.map((a) => ({ ...a })),
  fileIds: [...task.fileIds]
});
