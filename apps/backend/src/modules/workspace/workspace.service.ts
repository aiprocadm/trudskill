import { Injectable } from '@nestjs/common';

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

  getWorkspaceSummary(tenantId: string) {
    const tasks = this.getTasksInbox(tenantId);
    const blockers = this.getBlockers(tenantId);
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

  getTasksInbox(tenantId: string): WorkspaceTaskItem[] {
    const seed = this.fallbackByTenant.get(tenantId);
    if (!seed) return [];
    const now = Date.now();
    return seed.tasks.map((task) => ({
      ...task,
      status: task.dueAt && new Date(task.dueAt).getTime() < now ? 'overdue' : task.status
    }));
  }

  getBlockers(tenantId: string): WorkspaceBlockerItem[] {
    const seed = this.fallbackByTenant.get(tenantId);
    if (!seed) return [];
    return [...seed.blockers];
  }
}
