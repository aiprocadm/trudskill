'use client';

import { useQuery } from '@tanstack/react-query';
import { ListPage, StatusChip } from '@trudskill/ui';

import { backgroundTasksApi } from './api';
import { FALLBACK_STATUS_LABEL, KEEP_WORKING_HINT, isFinished, progressText } from './model';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { formatDateTime } from '../mvp/screen-helpers';

import type { BackgroundTask } from './model';
import type { Column } from '@trudskill/ui';

/**
 * Раздел «Фоновые задачи» (ТЗ 12.2; название — по правилу 4.2, никаких «джобов»).
 *
 * Отвечает на один вопрос: «что стало с тем, что я отправил». До него человек, поставивший
 * массовое зачисление, получал номер сообщения и не знал, куда смотреть (журнал 518).
 */

/*
 * Состояние задачи переводится в состояние сущности, которое понимает общий значок: «Готово» —
 * зелёное, «Не выполнена» — красное, остальное — нейтральное. Свой набор цветов здесь завёл бы
 * вторую палитру состояний рядом с общей.
 */
const chipStatus = (task: BackgroundTask): string => {
  if (task.status === 'succeeded') return 'active';
  if (task.status === 'failed') return 'blocked';
  return 'pending';
};

export const BackgroundTasksScreen = () => {
  const { session } = useAuth();
  const tasks = useQuery({
    queryKey: ['background-tasks'],
    enabled: Boolean(session),
    queryFn: () => backgroundTasksApi.list(session!),
    /* Задача идёт в фоне: список обновляется сам, иначе человек будет жать F5. */
    refetchInterval: 15_000
  });
  const labels = useQuery({
    queryKey: ['background-tasks', 'labels'],
    enabled: Boolean(session),
    queryFn: () => backgroundTasksApi.labels(session!)
  });

  const statusLabel = (task: BackgroundTask): string =>
    labels.data?.statuses?.[task.status] ?? FALLBACK_STATUS_LABEL[task.status];
  const kindLabel = (task: BackgroundTask): string => labels.data?.kinds?.[task.kind] ?? task.title;

  const columns: Column<BackgroundTask>[] = [
    { key: 'kind', title: 'Что делается', render: (task) => kindLabel(task) },
    { key: 'title', title: 'Подробности' },
    {
      key: 'status',
      title: 'Статус',
      render: (task) => <StatusChip status={chipStatus(task)} label={statusLabel(task)} />
    },
    { key: 'doneCount', title: 'Сделано', render: (task) => progressText(task) },
    { key: 'createdAt', title: 'Поставлена', render: (task) => formatDateTime(task.createdAt) },
    {
      key: 'errorText',
      title: 'Итог',
      render: (task) =>
        task.errorText
          ? /* Отказ без причины — тупик: человек идёт звонить в центр (правило продукта №4). */
            task.errorText
          : isFinished(task.status) && task.finishedAt
            ? formatDateTime(task.finishedAt)
            : ''
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Фоновые задачи"
        subtitle="Долгие операции: массовые зачисления, выдача документов, выгрузки"
      />

      <SectionCard title="Ваши задачи">
        <p className="ui-hint">{KEEP_WORKING_HINT}</p>

        <ListPage
          columns={columns}
          rows={tasks.data?.items ?? []}
          rowKey={(task) => task.id}
          isLoading={tasks.isLoading}
          error={tasks.error ? 'Не удалось загрузить список задач' : undefined}
          onRetry={() => void tasks.refetch()}
          emptyMessage="Пока ни одной фоновой задачи"
          emptyHint="Сюда попадают долгие операции — например, массовое зачисление списком. Отправьте список слушателей, и задача появится здесь."
        />
      </SectionCard>
    </PageContainer>
  );
};
