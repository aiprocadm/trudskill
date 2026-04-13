import { Injectable } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export interface WorkspaceTaskItem {
  id: string;
  tenantId: string;
  title: string;
  status: 'open' | 'in_progress' | 'overdue';
  dueAt?: string;
  route: string;
}

export interface WorkspaceBlockerItem {
  id: string;
  tenantId: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  route: string;
}

interface WorkspaceSeed {
  tasks: WorkspaceTaskItem[];
  blockers: WorkspaceBlockerItem[];
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}

  private readonly fallbackByTenant = new Map<string, WorkspaceSeed>([
    [
      'tenant_demo',
      {
        tasks: [
          {
            id: 'task_review_sign_1',
            tenantId: 'tenant_demo',
            title: 'Проверить пакет документов на подпись',
            status: 'in_progress',
            dueAt: '2099-01-01T10:00:00.000Z',
            route: '/esign'
          },
          {
            id: 'task_publish_course_1',
            tenantId: 'tenant_demo',
            title: 'Опубликовать обновленный учебный курс',
            status: 'open',
            dueAt: '2099-01-02T12:00:00.000Z',
            route: '/courses'
          }
        ],
        blockers: [
          {
            id: 'blocker_integration_token',
            tenantId: 'tenant_demo',
            title: 'Требуется обновление токена интеграции',
            severity: 'high',
            route: '/integrations'
          }
        ]
      }
    ],
    [
      't1',
      {
        tasks: [
          {
            id: 'task_review_sign_t1',
            tenantId: 't1',
            title: 'Проверить пакет документов на подпись',
            status: 'in_progress',
            dueAt: '2099-01-01T10:00:00.000Z',
            route: '/esign'
          },
          {
            id: 'task_publish_course_t1',
            tenantId: 't1',
            title: 'Опубликовать обновленный учебный курс',
            status: 'open',
            dueAt: '2099-01-02T12:00:00.000Z',
            route: '/courses'
          }
        ],
        blockers: [
          {
            id: 'blocker_integration_token_t1',
            tenantId: 't1',
            title: 'Требуется обновление токена интеграции',
            severity: 'high',
            route: '/integrations'
          }
        ]
      }
    ]
  ]);

  async getWorkspaceSummary(tenantId: string) {
    const tasks = await this.getTasksInbox(tenantId);
    const blockers = await this.getBlockers(tenantId);
    const overdue = tasks.filter((item) => item.status === 'overdue').length;

    return {
      overdueCount: overdue,
      blockersCount: blockers.length,
      nextActions: tasks.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        route: item.route
      })),
      deepLinks: [
        { key: 'tasks.inbox', route: '/tasks/inbox' },
        { key: 'workspace.blockers', route: '/blockers' }
      ]
    };
  }

  async getTasksInbox(tenantId: string): Promise<WorkspaceTaskItem[]> {
    const runtimeTasks = [
      ...(await this.tasksFromMvpRuntime(tenantId)),
      ...(await this.tasksFromDocumentsRuntime(tenantId))
    ];

    if (runtimeTasks.length > 0) {
      return this.normalizeTaskStatus(runtimeTasks).slice(0, 30);
    }

    const seed = this.fallbackByTenant.get(tenantId);
    if (!seed) return [];
    return this.normalizeTaskStatus(seed.tasks);
  }

  async getBlockers(tenantId: string): Promise<WorkspaceBlockerItem[]> {
    const runtimeBlockers = await this.blockersFromDocumentsRuntime(tenantId);
    if (runtimeBlockers.length > 0) {
      return runtimeBlockers;
    }

    const seed = this.fallbackByTenant.get(tenantId);
    if (!seed) return [];
    return [...seed.blockers];
  }

  /** Draft courses stored in MVP JSON runtime (postgres driver). */
  private async tasksFromMvpRuntime(tenantId: string): Promise<WorkspaceTaskItem[]> {
    if (backendEnv.MVP_PERSISTENCE_DRIVER !== 'postgres') return [];
    const rows = await this.db.query<{ id: string; data: { title?: string } }>(
      `select id, data from learning.mvp_runtime_documents
       where tenant_id = $1 and collection = 'courses' and data->>'status' = 'draft'
       order by updated_at desc
       limit 15`,
      [tenantId]
    );
    return rows.map((row) => ({
      id: `ws_draft_course_${row.id}`,
      tenantId,
      title: `Черновик курса: ${row.data.title ?? row.id}`,
      status: 'open' as const,
      route: `/courses/${row.id}`
    }));
  }

  /** Active documents generation tasks from runtime store. */
  private async tasksFromDocumentsRuntime(tenantId: string): Promise<WorkspaceTaskItem[]> {
    if (backendEnv.DOCUMENTS_PERSISTENCE_DRIVER !== 'postgres') return [];
    const rows = await this.db.query<{
      id: string;
      data: {
        status?: 'queued' | 'running' | 'completed' | 'failed';
        documentType?: string;
        requestedAt?: string;
      };
    }>(
      `select id, data from documents.runtime_documents
       where tenant_id = $1 and collection = 'tasks' and data->>'status' in ('queued', 'running')
       order by updated_at desc
       limit 15`,
      [tenantId]
    );

    return rows.map((row) => ({
      id: `ws_doc_task_${row.id}`,
      tenantId,
      title: `Генерация документа: ${row.data.documentType ?? 'document'}`,
      status: row.data.status === 'running' ? 'in_progress' : 'open',
      dueAt: row.data.requestedAt,
      route: '/documents'
    }));
  }

  /** Failed documents tasks mapped to high-severity blockers. */
  private async blockersFromDocumentsRuntime(tenantId: string): Promise<WorkspaceBlockerItem[]> {
    if (backendEnv.DOCUMENTS_PERSISTENCE_DRIVER !== 'postgres') return [];
    const rows = await this.db.query<{
      id: string;
      data: { documentType?: string; errorMessage?: string };
    }>(
      `select id, data from documents.runtime_documents
       where tenant_id = $1 and collection = 'tasks' and data->>'status' = 'failed'
       order by updated_at desc
       limit 10`,
      [tenantId]
    );

    return rows.map((row) => ({
      id: `ws_doc_blocker_${row.id}`,
      tenantId,
      title: `Сбой генерации документа: ${row.data.documentType ?? 'document'}${
        row.data.errorMessage ? ` (${row.data.errorMessage})` : ''
      }`,
      severity: 'high',
      route: '/documents'
    }));
  }

  private normalizeTaskStatus(tasks: WorkspaceTaskItem[]): WorkspaceTaskItem[] {
    const now = Date.now();
    return tasks.map((task) => {
      const isOverdue = task.dueAt ? new Date(task.dueAt).getTime() < now : false;
      return {
        ...task,
        status: isOverdue ? 'overdue' : task.status
      };
    });
  }
}
