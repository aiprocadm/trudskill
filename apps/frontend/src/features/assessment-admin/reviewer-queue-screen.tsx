'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';

import { formatDateTime } from './format';
import { useReviewerQueue } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { ReviewerQueueListItem } from './types';
import type { Column } from '@cdoprof/ui';

export function ReviewerQueueScreen() {
  const queue = useReviewerQueue();

  const attemptColumns: Column<ReviewerQueueListItem>[] = [
    { key: 'learnerId', title: 'Учащийся', render: (i) => i.learnerId },
    { key: 'testId', title: 'Тест', render: (i) => i.testId ?? '—' },
    { key: 'submittedAt', title: 'Отправлено', render: (i) => formatDateTime(i.submittedAt) }
  ];

  const submissionColumns: Column<ReviewerQueueListItem>[] = [
    { key: 'learnerId', title: 'Учащийся', render: (i) => i.learnerId },
    {
      key: 'assignmentId',
      title: 'Задание',
      render: (i) => i.assignmentId ?? '—'
    },
    { key: 'submittedAt', title: 'Отправлено', render: (i) => formatDateTime(i.submittedAt) }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Очередь на проверку"
        subtitle="Тестовые попытки с эссе-вопросами и практические работы, требующие ручного ревью. Действия проверки — Plan C."
      />

      {queue.isLoading ? (
        <LoadingState message="Загрузка очереди…" />
      ) : queue.error ? (
        <SectionError
          message={
            queue.error instanceof Error ? queue.error.message : 'Не удалось загрузить очередь'
          }
          onRetry={() => void queue.refetch()}
        />
      ) : (
        <>
          <SectionCard title="Попытки тестов">
            {queue.data && queue.data.pendingAttempts.length > 0 ? (
              <DataTable<ReviewerQueueListItem>
                columns={attemptColumns}
                rows={queue.data.pendingAttempts}
              />
            ) : (
              <SectionEmpty
                message="Pending attempts отсутствуют"
                hint="Plans B+C добавят попытки и активные действия."
              />
            )}
          </SectionCard>

          <SectionCard title="Практические работы">
            {queue.data && queue.data.pendingSubmissions.length > 0 ? (
              <DataTable<ReviewerQueueListItem>
                columns={submissionColumns}
                rows={queue.data.pendingSubmissions}
              />
            ) : (
              <SectionEmpty
                message="Pending submissions отсутствуют"
                hint="Plan C добавит submission/review lifecycle."
              />
            )}
          </SectionCard>
        </>
      )}
    </PageContainer>
  );
}
