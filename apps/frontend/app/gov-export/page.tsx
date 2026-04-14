'use client';

import { DataTable, FilterBar, LoadingState } from '@cdoprof/ui';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { useExportTasks, useSyncLogs } from '../../src/features/integrations/hooks';
import { apiRequest } from '../../src/lib/api/client';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function GovExportPage() {
  const { session } = useAuth();
  const [providerCode, setProviderCode] = useState('frdo');
  const [exportType, setExportType] = useState('learners');
  const [sourceFilter, setSourceFilter] = useState('{}');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const tasks = useExportTasks(true);
  const logs = useSyncLogs();

  const onCreateTask = async () => {
    if (!session) return;
    setCreating(true);
    setCreateError(null);
    try {
      const parsed = JSON.parse(sourceFilter || '{}') as Record<string, unknown>;
      await apiRequest('/exports/tasks', {
        method: 'POST',
        body: { providerCode, exportType, sourceFilterJsonb: parsed },
        auth: {
          accessToken: session.tokens.accessToken,
          tenantId: session.user.tenantId,
          userId: session.user.id
        }
      });
      await tasks.refetch();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Ошибка создания задачи');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Выгрузки ФИС ФРДО / ЕИСОТ"
          subtitle="П. 5.22 ТЗ — XML, валидация, история выгрузок"
        />
        <SectionCard title="Мастер формирования пакета">
          <FilterBar>
            <select value={providerCode} onChange={(event) => setProviderCode(event.target.value)}>
              <option value="frdo">frdo</option>
              <option value="eisot">eisot</option>
            </select>
            <select value={exportType} onChange={(event) => setExportType(event.target.value)}>
              <option value="learners">learners</option>
              <option value="courses">courses</option>
              <option value="groups">groups</option>
            </select>
            <input
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              placeholder='{"groupId":"g1"}'
            />
            <button type="button" onClick={() => void onCreateTask()} disabled={creating}>
              {creating ? 'Создание...' : 'Создать задачу выгрузки'}
            </button>
          </FilterBar>
          {createError ? <SectionError message={createError} /> : null}
        </SectionCard>
        <SectionCard title="История задач">
          {tasks.loading ? <LoadingState message="Загрузка задач..." /> : null}
          {tasks.error ? <SectionError message={tasks.error} /> : null}
          {!tasks.loading && !tasks.error && !tasks.data.length ? (
            <SectionEmpty message="Задачи выгрузки отсутствуют" />
          ) : null}
          {tasks.data.length ? (
            <DataTable
              columns={[
                { key: 'id', title: 'Task ID' },
                { key: 'providerCode', title: 'Провайдер' },
                { key: 'exportType', title: 'Тип' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={tasks.data}
            />
          ) : null}
        </SectionCard>
        <SectionCard title="Журнал валидации и синхронизации">
          {logs.loading ? <LoadingState message="Загрузка логов..." /> : null}
          {logs.error ? <SectionError message={logs.error} /> : null}
          {!logs.loading && !logs.error && !logs.data.length ? (
            <SectionEmpty message="Логи отсутствуют" />
          ) : null}
          {logs.data.length ? (
            <DataTable
              columns={[
                { key: 'providerCode', title: 'Провайдер' },
                { key: 'entityType', title: 'Сущность' },
                { key: 'statusCode', title: 'HTTP' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={logs.data}
            />
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
