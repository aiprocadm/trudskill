'use client';

import { DataTable, StatusChip } from '@cdoprof/ui';
import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { useTaskRealtime } from '../../src/features/communication/hooks';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

interface TemplateDto {
  name: string;
  type: string;
  status: string;
  currentVersion: string;
  updatedAt: string;
}
interface TaskDto {
  id: string;
  status: string;
  source: string;
}

export default function DocumentsPage() {
  const { session } = useAuth();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = session
    ? {
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      }
    : {};

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [templatesResp, tasksResp] = await Promise.all([
        apiRequest<{ items: TemplateDto[] }>('/templates', auth),
        apiRequest<{ items: TaskDto[] }>('/document-tasks', auth)
      ]);
      setTemplates(templatesResp.items);
      setTasks(tasksResp.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить документы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [session]);
  useTaskRealtime(tasks[0]?.id, () => void refresh());

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Документы" />
        <SectionCard title="Реестр шаблонов">
          {loading ? <p>Загрузка...</p> : null}
          {error ? <SectionError message={error} /> : null}
          {templates.length ? (
            <>
              <DataTable
                columns={[
                  { key: 'name', title: 'Шаблон' },
                  { key: 'type', title: 'Тип' },
                  { key: 'currentVersion', title: 'Текущая версия' },
                  { key: 'updatedAt', title: 'Обновлен' }
                ]}
                rows={templates}
              />
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                {templates.map((item) => (
                  <StatusChip key={item.name} status={item.status} />
                ))}
              </div>
            </>
          ) : null}
          {!loading && !templates.length ? <SectionEmpty message="Шаблоны не найдены" /> : null}
        </SectionCard>
        <SectionCard title="Статусы async задач">
          {tasks.length ? (
            <DataTable
              columns={[
                { key: 'id', title: 'Task ID' },
                { key: 'source', title: 'Источник' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={tasks}
            />
          ) : (
            <SectionEmpty message="Нет задач" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
