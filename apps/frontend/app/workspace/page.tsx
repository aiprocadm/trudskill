'use client';

import { DataTable } from '@cdoprof/ui';
import { useQuery } from '@tanstack/react-query';

import { type WorkspaceSummary, resolveWorkspaceErrorMessage } from './page.utils';
import {
  GlobalLoading,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { apiClient } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

interface WorkspaceTaskItem {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'overdue';
  dueAt?: string;
  route: string;
}
interface WorkspaceBlockerItem {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  route: string;
}

export default function WorkspacePage() {
  const { session } = useAuth();

  const workspace = useQuery({
    queryKey: ['workspace', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const auth = { accessToken: session!.tokens.accessToken, tenantId: session!.user.tenantId };
      const [summary, tasksInbox, blockersProjection] = await Promise.all([
        apiClient.get<WorkspaceSummary>('/workspace/summary', { auth }),
        apiClient.get<{ items: WorkspaceTaskItem[] }>('/tasks/inbox', { auth }),
        apiClient.get<{ items: WorkspaceBlockerItem[] }>('/blockers', { auth })
      ]);
      return { summary, tasks: tasksInbox.items, blockers: blockersProjection.items };
    }
  });

  if (!session || workspace.isLoading) {
    return (
      <ProtectedPage>
        <GlobalLoading message="Загружаем workspace..." />
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Operational workspace"
          subtitle="Сводка overdue задач, блокеров и следующих действий"
          actions={
            <button type="button" onClick={() => void workspace.refetch()}>
              Обновить
            </button>
          }
        />
        {workspace.error ? (
          <SectionError message={resolveWorkspaceErrorMessage(workspace.error)} />
        ) : null}
        <SectionCard title="Ключевые показатели">
          <div className="ui-inline">
            <strong>Overdue: {workspace.data?.summary.overdueCount ?? 0}</strong>
            <strong>Blockers: {workspace.data?.summary.blockersCount ?? 0}</strong>
          </div>
        </SectionCard>
        <SectionCard title="Следующие действия">
          {workspace.data?.summary.nextActions.length ? (
            <DataTable
              columns={[
                { key: 'title', title: 'Задача' },
                { key: 'route', title: 'Маршрут' }
              ]}
              rows={workspace.data.summary.nextActions}
            />
          ) : (
            <SectionEmpty message="Нет следующих действий" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
