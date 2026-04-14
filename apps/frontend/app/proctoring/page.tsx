'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import { useMemo } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useSyncLogs } from '../../src/features/integrations/hooks';
import { useAssignments } from '../../src/features/mvp/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ProctoringPage() {
  const assignments = useAssignments({ page: 1, page_size: 20 });
  const syncLogs = useSyncLogs();
  const proctoringLogs = useMemo(
    () =>
      syncLogs.data.filter(
        (item) => item.providerCode.includes('proctor') || item.entityType.includes('proctor')
      ),
    [syncLogs.data]
  );

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Прокторинг"
          subtitle="П. 5.16 ТЗ — проверка оборудования, сессия, протокол, интеграция с внешним сервисом"
        />
        <SectionCard title="Назначения на контроль">
          {assignments.loading ? <LoadingState message="Загрузка назначений..." /> : null}
          {assignments.error ? <SectionError message={assignments.error} /> : null}
          {assignments.data?.items.length ? (
            <DataTable
              columns={[
                { key: 'id', title: 'Assignment ID' },
                { key: 'title', title: 'Название' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={assignments.data.items}
            />
          ) : (
            <SectionEmpty message="Нет назначений для прокторинга" />
          )}
        </SectionCard>
        <SectionCard title="Журнал прокторинга">
          {syncLogs.loading ? <LoadingState message="Загрузка логов..." /> : null}
          {syncLogs.error ? <SectionError message={syncLogs.error} /> : null}
          {proctoringLogs.length ? (
            <DataTable
              columns={[
                { key: 'providerCode', title: 'Провайдер' },
                { key: 'entityType', title: 'Сущность' },
                { key: 'statusCode', title: 'HTTP' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={proctoringLogs}
            />
          ) : (
            <SectionEmpty message="Логи прокторинга не найдены" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
