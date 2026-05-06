import { apiRequest } from '../../lib/api/client';

import type {
  WorkspaceBlockerItem,
  WorkspaceSummary,
  WorkspaceTaskItem
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const workspaceApi = {
  getSummary: (session: UserSession) =>
    apiRequest<WorkspaceSummary>(`/workspace/summary`, withAuth(session)),
  getTasksInbox: (session: UserSession) =>
    apiRequest<{ items: WorkspaceTaskItem[] }>(`/tasks/inbox`, withAuth(session)),
  getBlockersProjection: (session: UserSession) =>
    apiRequest<{ items: WorkspaceBlockerItem[] }>(`/blockers`, withAuth(session)),

  loadDashboard: async (session: UserSession) => {
    const [summary, tasksInbox, blockersProjection] = await Promise.all([
      workspaceApi.getSummary(session),
      workspaceApi.getTasksInbox(session),
      workspaceApi.getBlockersProjection(session)
    ]);
    return {
      summary,
      tasks: tasksInbox.items,
      blockers: blockersProjection.items
    };
  }
};
