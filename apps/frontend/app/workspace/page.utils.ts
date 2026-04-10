import { ApiClientError } from '../../src/lib/api/client';

export interface WorkspaceSummary {
  overdueCount: number;
  blockersCount: number;
  nextActions: Array<{ id: string; title: string; route: string }>;
  deepLinks?: Array<{ key: string; route: string }>;
}

export interface WorkspaceTaskItem {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'overdue';
  dueAt?: string;
  route: string;
}

export interface WorkspaceBlockerItem {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  route: string;
}

export function resolveWorkspaceErrorMessage(err: unknown): string {
  return err instanceof ApiClientError
    ? err.normalized.message
    : 'Не удалось загрузить рабочую сводку';
}

export function resolveWorkspaceState(params: {
  sessionPresent: boolean;
  loading: boolean;
  error: string | null;
  summary: WorkspaceSummary | null;
  tasks: WorkspaceTaskItem[];
  blockers: WorkspaceBlockerItem[];
}) {
  if (!params.sessionPresent || params.loading) {
    return {
      kind: 'loading' as const,
      showSummary: false,
      showNextActionsEmpty: false,
      showTasksEmpty: false,
      showBlockersEmpty: false
    };
  }

  const hasSummary = Boolean(params.summary);
  const hasNextActions = Boolean(params.summary?.nextActions?.length);
  return {
    kind: params.error ? ('error' as const) : ('ready' as const),
    showSummary: !params.error && hasSummary,
    showNextActionsEmpty: !hasNextActions,
    showTasksEmpty: params.tasks.length === 0,
    showBlockersEmpty: params.blockers.length === 0
  };
}
