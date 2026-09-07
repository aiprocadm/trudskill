'use client';

import { DataTable, LoadingState } from '@trudskill/ui';

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
import type { Column } from '@trudskill/ui';

export function ReviewerQueueScreen() {
  const queue = useReviewerQueue();

  const attemptColumns: Column<ReviewerQueueListItem>[] = [
    /* Ревизия: были идентификаторы вместо имён; «Учащийся» → «Слушатель» (одно слово на понятие). */
    { key: 'learnerId', title: 'Слушатель', render: (i) => i.learnerName ?? 'Имя не передано' },
    { key: 'testId', title: 'Тест', render: (i) => i.testTitle ?? 'Без названия' },
    { key: 'submittedAt', title: 'Отправлено', render: (i) => formatDateTime(i.submittedAt) }
  ];

  const submissionColumns: Column<ReviewerQueueListItem>[] = [
    { key: 'learnerId', title: 'Слушатель', render: (i) => i.learnerName ?? 'Имя не передано' },
    {
      key: 'assignmentId',
      title: 'Задание',
      render: (i) => i.assignmentTitle ?? 'Без названия'
    },
    { key: 'submittedAt', title: 'Отправлено', render: (i) => formatDateTime(i.submittedAt) }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Очередь на проверку"
        subtitle="Развёрнутые ответы и практические работы, которые проверяет человек: их нельзя оценить автоматически"
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
                message="Работ на проверке нет"
                hint="Здесь появятся попытки тестов, которые ждут вашей проверки."
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
                message="Сданных заданий на проверке нет"
                hint="Здесь появятся практические работы, сданные слушателями."
              />
            )}
          </SectionCard>
        </>
      )}
    </PageContainer>
  );
}
