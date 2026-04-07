'use client';

import { useEffect, useState } from 'react';

import {
  GlobalLoading,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { ApiClientError, apiClient } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

interface WorkspaceSummary {
  overdueCount: number;
  blockersCount: number;
  nextActions: Array<{ id: string; title: string; route: string }>;
  deepLinks: Array<{ key: string; route: string }>;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [tasks, setTasks] = useState<WorkspaceTaskItem[]>([]);
  const [blockers, setBlockers] = useState<WorkspaceBlockerItem[]>([]);

  const reload = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const auth = {
        accessToken: session.tokens.accessToken,
        tenantId: session.user.tenantId
      };
      const [workspaceSummary, tasksInbox, blockersProjection] = await Promise.all([
        apiClient.get<WorkspaceSummary>('/workspace/summary', { auth }),
        apiClient.get<{ items: WorkspaceTaskItem[] }>('/tasks/inbox', { auth }),
        apiClient.get<{ items: WorkspaceBlockerItem[] }>('/blockers', { auth })
      ]);
      setSummary(workspaceSummary);
      setTasks(tasksInbox.items);
      setBlockers(blockersProjection.items);
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.normalized.message
          : 'Не удалось загрузить рабочую сводку';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [session?.tokens.accessToken, session?.user.tenantId]);

  if (!session || loading) {
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
          actions={<button onClick={() => void reload()}>Обновить</button>}
        />
        {error ? <SectionError message={error} onRetry={() => void reload()} /> : null}
        {!error && summary ? (
          <SectionCard title="Ключевые показатели">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <strong>Overdue: {summary.overdueCount}</strong>
              <strong>Blockers: {summary.blockersCount}</strong>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Следующие действия">
          {summary?.nextActions?.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {summary.nextActions.map((item) => (
                <li key={item.id}>
                  {item.title} ({item.route})
                </li>
              ))}
            </ul>
          ) : (
            <SectionEmpty message="Нет следующих действий" />
          )}
        </SectionCard>

        <SectionCard title="Task inbox">
          {tasks.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {tasks.map((task) => (
                <li key={task.id}>
                  {task.title} — {task.status}
                </li>
              ))}
            </ul>
          ) : (
            <SectionEmpty message="Нет задач в inbox" />
          )}
        </SectionCard>

        <SectionCard title="Blockers">
          {blockers.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {blockers.map((item) => (
                <li key={item.id}>
                  {item.title} — {item.severity}
                </li>
              ))}
            </ul>
          ) : (
            <SectionEmpty message="Нет активных блокеров" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
