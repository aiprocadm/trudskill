import { ApiClientError } from '../../src/lib/api/client';

import type {
  WorkspaceBlockerItem,
  WorkspaceSummary,
  WorkspaceTaskItem
} from '../../src/features/workspace/types';

export type { WorkspaceBlockerItem, WorkspaceSummary, WorkspaceTaskItem };

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
