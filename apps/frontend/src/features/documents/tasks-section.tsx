'use client';

import { DataTable, DetailDrawer, KeyValueList, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { type TaskDto, documentsApi } from './api';
import { canCancel, canRetry, taskSourceLabel, taskStatusLabel } from './task-labels';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { formatDate } from '../mvp/screen-helpers';

import type { ReactElement } from 'react';

interface TaskRow {
  id: string;
  statusView: ReactElement;
  sourceView: string;
  requestedView: string;
  finishedView: string;
}

/*
 * Задачи выпуска (Фаза 4, срез 7). Что изменилось:
 *
 * 1. Колонка «Task ID» с идентификатором убрана — она ничего не сообщала. Задача опознаётся
 *    по тому, что и когда выпускалось.
 * 2. Состояния были кодами (`queued`, `running`, `failed`), даты — машинными строками.
 * 3. **Кнопка «Детали» выводила задачу как JSON** прямо на страницу. Теперь — панель
 *    с полями по-русски, а технический идентификатор спрятан под спойлер (`TXT-004`).
 * 4. Действия строки — в своей колонке, а не тремя кнопками под таблицей на каждую задачу.
 */
export const TasksSection = ({
  tasks,
  onRefetch
}: {
  tasks: TaskDto[];
  onRefetch: () => Promise<unknown>;
}) => {
  const { session } = useAuth();
  const [selected, setSelected] = useState<TaskDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: 'retry' | 'cancel', taskId: string) => {
    if (!session) return;
    setError(null);
    try {
      if (action === 'retry') await documentsApi.retryTask(session, taskId);
      else await documentsApi.cancelTask(session, taskId);
      await onRefetch();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : action === 'retry'
            ? 'Не удалось повторить выпуск'
            : 'Не удалось отменить выпуск'
      );
    }
  };

  const rows: TaskRow[] = tasks.map((task) => ({
    id: task.id,
    statusView: <StatusChip status={task.status} label={taskStatusLabel(task.status)} />,
    sourceView: taskSourceLabel(task.source),
    requestedView: formatDate(task.requestedAt),
    finishedView: formatDate(task.finishedAt)
  }));

  return (
    <SectionCard title="Задачи выпуска">
      {error ? <SectionError message={error} /> : null}
      {tasks.length === 0 ? (
        <SectionEmpty
          message="Выпуск пока не запускали"
          hint="Задача появляется здесь, когда документ выпускают вручную по шаблону или автоматически — при завершении обучения и закрытии группы."
        />
      ) : (
        <DataTable<TaskRow>
          columns={[
            { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
            { key: 'sourceView', title: 'Откуда запущено' },
            { key: 'requestedView', title: 'Запрошено' },
            { key: 'finishedView', title: 'Завершено' }
          ]}
          rows={rows}
          rowKey={(row) => row.id}
          rowActions={(row) => {
            const task = tasks.find((item) => item.id === row.id);
            if (!task) return [];
            return [
              { label: 'Открыть задачу', primary: true, onSelect: () => setSelected(task) },
              ...(canRetry(task)
                ? [{ label: 'Повторить', onSelect: () => void run('retry', task.id) }]
                : []),
              ...(canCancel(task)
                ? [{ label: 'Отменить', danger: true, onSelect: () => void run('cancel', task.id) }]
                : [])
            ];
          }}
        />
      )}

      {selected ? (
        <DetailDrawer
          open={true}
          title="Задача выпуска"
          width="sm"
          onClose={() => setSelected(null)}
        >
          <KeyValueList
            items={[
              { label: 'Статус', value: taskStatusLabel(selected.status) },
              { label: 'Откуда запущено', value: taskSourceLabel(selected.source) },
              { label: 'Запрошено', value: formatDate(selected.requestedAt) },
              { label: 'Завершено', value: formatDate(selected.finishedAt) }
            ]}
          />
          {selected.errorMessage ? (
            <SectionError message={`Выпуск не удался: ${selected.errorMessage}`} />
          ) : null}
          {/* TXT-004: технический идентификатор нужен поддержке, но не мешается человеку. */}
          <details>
            <summary>Технические сведения</summary>
            <p className="ui-hint">Идентификатор задачи: {selected.id}</p>
          </details>
        </DetailDrawer>
      ) : null}
    </SectionCard>
  );
};
