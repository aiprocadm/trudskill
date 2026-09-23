import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type { TasksRepository } from './tasks.repository.js';
import type {
  Task,
  TaskActor,
  TaskAssignee,
  TaskComment,
  TaskListPage,
  TaskListQuery,
  TaskPriority,
  TaskStatus
} from './tasks.types.js';
import type { PoolClient } from 'pg';

interface TaskDbRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  label: string | null;
  color: string | null;
  starts_at: Date | string | null;
  due_at: Date | string | null;
  all_day: boolean;
  creator_user_id: string;
  counterparty_id: string | null;
  contact_id: string | null;
  group_id: string | null;
  learner_id: string | null;
  lesson_id: string | null;
  reminder: { minutesBefore: number; channels: string[] } | null;
  done_at: Date | string | null;
  confirmed_at: Date | string | null;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string;
}

interface AssigneeDbRow {
  task_id: string;
  user_id: string;
  state: string;
  updated_at: Date | string;
}

interface FileDbRow {
  task_id: string;
  file_id: string;
}

interface CommentDbRow {
  id: string;
  tenant_id: string;
  task_id: string;
  author_user_id: string;
  text: string;
  created_at: Date | string;
}

/** Колонка ссылки по типу связанного объекта из `entity_type` (§16) — белый список, не подстановка. */
const ENTITY_COLUMNS: Record<NonNullable<TaskListQuery['entityType']>, string> = {
  counterparty: 'counterparty_id',
  contact: 'contact_id',
  group: 'group_id',
  learner: 'learner_id',
  lesson: 'lesson_id'
};

/**
 * Хранилище задач в `tasks.*` (миграция 0101).
 *
 * Каждый запрос ограничен `tenant_id` — это и есть изоляция центров на уровне данных. Списки
 * режет база (`limit/offset`) с полным порядком «срок, создание, id» — страницы не
 * перекрываются (сторож `paged-list-is-stable`). Записи из нескольких строк (задача +
 * исполнители + файлы) идут одной транзакцией (сторож `multi-write-is-atomic`).
 */
@Injectable()
export class PostgresTasksRepository implements TasksRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly columns = `t.id, t.tenant_id, t.title, t.description, t.status, t.priority, t.label,
    t.color, t.starts_at, t.due_at, t.all_day, t.creator_user_id, t.counterparty_id, t.contact_id,
    t.group_id, t.learner_id, t.lesson_id, t.reminder, t.done_at, t.confirmed_at, t.archived_at,
    t.created_at, t.updated_at`;

  async list(tenantId: string, actor: TaskActor, query: TaskListQuery): Promise<TaskListPage> {
    const params: unknown[] = [tenantId, actor.userId];
    // `t.tenant_id = $1` стоит в самом запросе ниже, а не в этом списке: отбор по центру —
    // условие, которое видно глазами (и сторожем `tenant-scoped-reads`), а не собирается.
    const conditions = ['t.archived_at is null'];
    const participant = `(t.creator_user_id = $2 or exists (
        select 1 from tasks.task_assignees a
        where a.tenant_id = t.tenant_id and a.task_id = t.id and a.user_id = $2))`;
    const mineOrAll = actor.manageAll ? 'true' : participant;

    switch (query.filter) {
      case 'assigned_to_me':
        conditions.push(`exists (select 1 from tasks.task_assignees a
          where a.tenant_id = t.tenant_id and a.task_id = t.id and a.user_id = $2)`);
        break;
      case 'created_by_me':
        conditions.push('t.creator_user_id = $2');
        break;
      case 'overdue':
        conditions.push(mineOrAll, `t.status in ('new', 'in_progress')`, 't.due_at < now()');
        break;
      case 'done':
        conditions.push(mineOrAll, `t.status in ('done', 'confirmed')`);
        break;
      case 'all':
        break;
    }
    if (query.assignee) {
      params.push(query.assignee);
      conditions.push(`exists (select 1 from tasks.task_assignees a
        where a.tenant_id = t.tenant_id and a.task_id = t.id and a.user_id = $${params.length})`);
    }
    if (query.dueFrom) {
      params.push(query.dueFrom);
      conditions.push(`t.due_at >= $${params.length}::timestamptz`);
    }
    if (query.dueTo) {
      params.push(query.dueTo);
      conditions.push(`t.due_at <= $${params.length}::timestamptz`);
    }
    if (query.label) {
      params.push(query.label);
      conditions.push(`t.label = $${params.length}`);
    }
    if (query.entityType && query.entityId) {
      params.push(query.entityId);
      conditions.push(`t.${ENTITY_COLUMNS[query.entityType]} = $${params.length}`);
    }
    params.push(query.pageSize, (query.page - 1) * query.pageSize);

    const rows = await this.db.query<TaskDbRow>(
      `select ${this.columns}, count(*) over()::text as total_count
       from tasks.tasks t
       where t.tenant_id = $1 and ${conditions.join(' and ')}
       order by t.due_at asc nulls last, t.created_at desc, t.id
       limit $${params.length - 1} offset $${params.length}`,
      params
    );
    const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
    const items = await this.hydrate(tenantId, rows);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getById(tenantId: string, id: string): Promise<Task | null> {
    const rows = await this.db.query<TaskDbRow>(
      `select ${this.columns} from tasks.tasks t where t.tenant_id = $1 and t.id = $2`,
      [tenantId, id]
    );
    if (!rows[0]) return null;
    const [task] = await this.hydrate(tenantId, rows);
    return task ?? null;
  }

  async insert(task: Task): Promise<Task> {
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(
        `insert into tasks.tasks
           (id, tenant_id, title, description, status, priority, label, color, starts_at, due_at,
            all_day, creator_user_id, counterparty_id, contact_id, group_id, learner_id, lesson_id,
            reminder, done_at, confirmed_at, archived_at, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23)`,
        this.rowValues(task)
      );
      await this.writeChildren(client, task);
    });
    return task;
  }

  async update(task: Task): Promise<Task> {
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(
        `update tasks.tasks set
           title = $3, description = $4, status = $5, priority = $6, label = $7, color = $8,
           starts_at = $9, due_at = $10, all_day = $11, creator_user_id = $12, counterparty_id = $13,
           contact_id = $14, group_id = $15, learner_id = $16, lesson_id = $17, reminder = $18::jsonb,
           done_at = $19, confirmed_at = $20, archived_at = $21, updated_at = $23
         where tenant_id = $2 and id = $1`,
        this.rowValues(task)
      );
      await client.query(`delete from tasks.task_assignees where tenant_id = $1 and task_id = $2`, [
        task.tenantId,
        task.id
      ]);
      await client.query(`delete from tasks.task_files where tenant_id = $1 and task_id = $2`, [
        task.tenantId,
        task.id
      ]);
      await this.writeChildren(client, task);
    });
    return task;
  }

  async listComments(tenantId: string, taskId: string): Promise<TaskComment[]> {
    const rows = await this.db.query<CommentDbRow & { file_id: string | null }>(
      `select c.id, c.tenant_id, c.task_id, c.author_user_id, c.text, c.created_at,
              (select f.file_id from tasks.task_files f
                where f.tenant_id = c.tenant_id and f.task_id = c.task_id and f.id = c.id) as file_id
       from tasks.task_comments c
       where c.tenant_id = $1 and c.task_id = $2
       order by c.created_at asc, c.id`,
      [tenantId, taskId]
    );
    return rows.map((r) => this.mapComment(r));
  }

  async getComment(
    tenantId: string,
    taskId: string,
    commentId: string
  ): Promise<TaskComment | null> {
    const rows = await this.db.query<CommentDbRow & { file_id: string | null }>(
      `select c.id, c.tenant_id, c.task_id, c.author_user_id, c.text, c.created_at,
              (select f.file_id from tasks.task_files f
                where f.tenant_id = c.tenant_id and f.task_id = c.task_id and f.id = c.id) as file_id
       from tasks.task_comments c
       where c.tenant_id = $1 and c.task_id = $2 and c.id = $3`,
      [tenantId, taskId, commentId]
    );
    return rows[0] ? this.mapComment(rows[0]) : null;
  }

  /**
   * Файл комментария хранится в `task_files` под id самого комментария (§4: у комментария
   * необязательный `file_id`; отдельной колонки в 0101 нет — и заводить её ради одного поля
   * незачем, пока файлов у комментариев единицы).
   */
  async insertComment(comment: TaskComment): Promise<TaskComment> {
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(
        `insert into tasks.task_comments (id, tenant_id, task_id, author_user_id, text, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $6)`,
        [
          comment.id,
          comment.tenantId,
          comment.taskId,
          comment.authorUserId,
          comment.text,
          comment.createdAt
        ]
      );
      if (comment.fileId) {
        await client.query(
          `insert into tasks.task_files (id, tenant_id, task_id, author_user_id, file_id, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $6)`,
          [
            comment.id,
            comment.tenantId,
            comment.taskId,
            comment.authorUserId,
            comment.fileId,
            comment.createdAt
          ]
        );
      }
    });
    return comment;
  }

  async deleteComment(tenantId: string, taskId: string, commentId: string): Promise<void> {
    await this.db.withTransaction(async (client: PoolClient) => {
      await client.query(
        `delete from tasks.task_files where tenant_id = $1 and task_id = $2 and id = $3`,
        [tenantId, taskId, commentId]
      );
      await client.query(
        `delete from tasks.task_comments where tenant_id = $1 and task_id = $2 and id = $3`,
        [tenantId, taskId, commentId]
      );
    });
  }

  /** §4: «исполнитель — сотрудник тенанта» — активный пользователь центра с ролью сотрудника. */
  async findStaffUserIds(tenantId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db.query<{ id: string }>(
      `select u.id from iam.users u
       where u.tenant_id = $1 and u.id = any($2) and u.deleted_at is null and u.status = 'active'
         and exists (
           select 1 from iam.user_roles ur
           join iam.roles r on r.id = ur.role_id and r.tenant_id = ur.tenant_id
           where ur.tenant_id = u.tenant_id and ur.user_id = u.id
             and r.code not in ('learner', 'counterparty_rep'))`,
      [tenantId, userIds]
    );
    return rows.map((r) => r.id);
  }

  async findExistingFileIds(tenantId: string, fileIds: string[]): Promise<string[]> {
    if (fileIds.length === 0) return [];
    const rows = await this.db.query<{ id: string }>(
      `select id from storage.files where tenant_id = $1 and id = any($2)`,
      [tenantId, fileIds]
    );
    return rows.map((r) => r.id);
  }

  private async writeChildren(client: PoolClient, task: Task): Promise<void> {
    if (task.assignees.length > 0) {
      const values: unknown[] = [];
      const placeholders = task.assignees.map((a, i) => {
        const base = i * 5;
        values.push(task.id, task.tenantId, a.userId, a.state, a.updatedAt);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 5})`;
      });
      await client.query(
        `insert into tasks.task_assignees (task_id, tenant_id, user_id, state, created_at, updated_at)
         values ${placeholders.join(', ')}`,
        values
      );
    }
    if (task.fileIds.length > 0) {
      const values: unknown[] = [];
      const placeholders = task.fileIds.map((fileId, i) => {
        const base = i * 6;
        values.push(
          `tfl_${task.id}_${i}`,
          task.tenantId,
          task.id,
          task.creatorUserId,
          fileId,
          task.updatedAt
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 6})`;
      });
      await client.query(
        `insert into tasks.task_files (id, tenant_id, task_id, author_user_id, file_id, created_at, updated_at)
         values ${placeholders.join(', ')}`,
        values
      );
    }
  }

  private async hydrate(tenantId: string, rows: TaskDbRow[]): Promise<Task[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const assignees = await this.db.query<AssigneeDbRow>(
      `select task_id, user_id, state, updated_at from tasks.task_assignees
       where tenant_id = $1 and task_id = any($2) order by created_at, user_id`,
      [tenantId, ids]
    );
    const files = await this.db.query<FileDbRow>(
      `select task_id, file_id from tasks.task_files
       where tenant_id = $1 and task_id = any($2) and id like 'tfl_%' order by id`,
      [tenantId, ids]
    );
    const byTask = new Map<string, TaskAssignee[]>();
    for (const a of assignees) {
      const list = byTask.get(a.task_id) ?? [];
      list.push({
        userId: a.user_id,
        state: a.state as TaskAssignee['state'],
        updatedAt: iso(a.updated_at)
      });
      byTask.set(a.task_id, list);
    }
    const filesByTask = new Map<string, string[]>();
    for (const f of files) {
      const list = filesByTask.get(f.task_id) ?? [];
      list.push(f.file_id);
      filesByTask.set(f.task_id, list);
    }
    return rows.map((row) =>
      this.map(row, byTask.get(row.id) ?? [], filesByTask.get(row.id) ?? [])
    );
  }

  private rowValues(task: Task): unknown[] {
    return [
      task.id,
      task.tenantId,
      task.title,
      task.description ?? null,
      task.status,
      task.priority,
      task.label ?? null,
      task.color ?? null,
      task.startsAt ?? null,
      task.dueAt ?? null,
      task.allDay,
      task.creatorUserId,
      task.links.counterpartyId ?? null,
      task.links.contactId ?? null,
      task.links.groupId ?? null,
      task.links.learnerId ?? null,
      task.links.lessonId ?? null,
      task.reminder ? JSON.stringify(task.reminder) : null,
      task.doneAt ?? null,
      task.confirmedAt ?? null,
      task.archivedAt ?? null,
      task.createdAt,
      task.updatedAt
    ];
  }

  private map(row: TaskDbRow, assignees: TaskAssignee[], fileIds: string[]): Task {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      ...(row.description ? { description: row.description } : {}),
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      ...(row.label ? { label: row.label } : {}),
      ...(row.color ? { color: row.color } : {}),
      ...(row.starts_at ? { startsAt: iso(row.starts_at) } : {}),
      ...(row.due_at ? { dueAt: iso(row.due_at) } : {}),
      allDay: row.all_day,
      creatorUserId: row.creator_user_id,
      links: {
        ...(row.counterparty_id ? { counterpartyId: row.counterparty_id } : {}),
        ...(row.contact_id ? { contactId: row.contact_id } : {}),
        ...(row.group_id ? { groupId: row.group_id } : {}),
        ...(row.learner_id ? { learnerId: row.learner_id } : {}),
        ...(row.lesson_id ? { lessonId: row.lesson_id } : {})
      },
      ...(row.reminder ? { reminder: row.reminder } : {}),
      ...(row.done_at ? { doneAt: iso(row.done_at) } : {}),
      ...(row.confirmed_at ? { confirmedAt: iso(row.confirmed_at) } : {}),
      ...(row.archived_at ? { archivedAt: iso(row.archived_at) } : {}),
      assignees,
      fileIds,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    };
  }

  private mapComment(row: CommentDbRow & { file_id: string | null }): TaskComment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      taskId: row.task_id,
      authorUserId: row.author_user_id,
      text: row.text,
      ...(row.file_id ? { fileId: row.file_id } : {}),
      createdAt: iso(row.created_at)
    };
  }
}

/** `timestamptz` из pg приходит `Date`; из фейковой базы в тестах — строкой. Наружу — ISO. */
const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
