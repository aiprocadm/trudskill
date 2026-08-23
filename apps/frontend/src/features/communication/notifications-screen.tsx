'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  DataTable,
  FilterBar,
  LookupSelect,
  PageContainer,
  PageHeader,
  Pagination,
  SectionCard,
  StatusChip
} from '@trudskill/ui';
import { useState } from 'react';

import { communicationApi, useNotificationsList, useNotificationsRealtime } from './hooks';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { formatDate } from '../mvp/screen-helpers';
import { PushSettingsScreen } from '../push/screens';

import type { NotificationDto } from './hooks';
import type { ReactElement } from 'react';

/**
 * `TPL-001` · «Центр уведомлений».
 *
 * Экран вынесен из `app/notifications/page.tsx` по чек-листу §15.1 и закрывает `CMP-021`:
 * прежде он был единственным потребителем `SimplePagination` — пары голых `<button>` мимо
 * `Pagination` из дизайн-системы.
 *
 * Заодно убраны три вещи, из-за которых экран читался как отладочный:
 * 1. Столбец «Статус» показывал машинные значения `unread` / `read` латиницей.
 * 2. Столбец «Создано» показывал строку вида `2026-08-01T10:00:00.000Z`.
 * 3. Под таблицей висел ВТОРОЙ список тех же уведомлений — кнопки «Отметить «…» как
 *    прочитанное». Отметка — действие над строкой, и её место в строке (`CMP-001`).
 */

const PAGE_SIZE = 20;

/** `TPL-006`: пустой экран объясняет, что это за раздел и что делать дальше. */
const emptyHint = (filter: string): string =>
  filter === 'unread'
    ? 'Непрочитанных не осталось. Снимите отбор, чтобы посмотреть все уведомления.'
    : 'Сюда приходят напоминания о сроках обучения, приглашения в группы и сообщения о выпуске документов. Пока центр не прислал ни одного.';

/** Что показывать. Два значения, поэтому обычный выбор, а не отдельные вкладки. */
const FILTERS = [
  { value: '', label: 'Все уведомления' },
  { value: 'unread', label: 'Только непрочитанные' }
];

/**
 * Статус уведомления в палитре `UI-023`: непрочитанное ждёт человека (жёлтый «Ожидает»),
 * прочитанное — уже неактуально (нейтральный). Ключ палитры и подпись задаются отдельно:
 * подпись — доменная («Не прочитано»), ключ — один из тринадцати цветов пакета.
 */
const NotificationStatus = ({ status }: { status: string }): ReactElement =>
  status === 'read' ? (
    <StatusChip status="inactive" label="Прочитано" />
  ) : (
    <StatusChip status="pending" label="Не прочитано" />
  );

export function NotificationsScreen(): ReactElement {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useNotificationsList(page, PAGE_SIZE, filter);

  /*
   * Без своего колбэка: хук на событие сам сбрасывает ключ `['notifications']`, на котором
   * сидит список выше. Переданный `refetch` добавлял ВТОРОЙ такой же запрос на каждое
   * событие — та же беда, что убрана из шапки (Фаза 6, дефект A).
   */
  useNotificationsRealtime();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markAllRead = async () => {
    if (!session) return;
    await communicationApi.markAllRead(session);
    await refresh();
  };

  const markRead = async (id: string) => {
    if (!session) return;
    await communicationApi.markRead(session, id);
    await refresh();
  };

  const items = data?.items ?? [];
  const hasUnread = items.some((item) => item.status !== 'read');
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? PAGE_SIZE)));

  return (
    <PageContainer>
      <PageHeader
        title="Центр уведомлений"
        subtitle="Напоминания о сроках, приглашения и сообщения о выпуске документов"
        {...(hasUnread
          ? {
              primaryAction: {
                label: 'Отметить все прочитанными',
                onSelect: () => void markAllRead()
              }
            }
          : {})}
      />
      <SectionCard title="Уведомления">
        <FilterBar>
          <LookupSelect items={FILTERS} value={filter} onChange={setFilter} label="Показывать" />
        </FilterBar>
        {error ? <SectionError message={error} /> : null}
        {!error ? (
          <div className="ui-table-wrap">
            <DataTable<NotificationDto>
              columns={[
                { key: 'subjectText', title: 'Тема' },
                { key: 'bodyText', title: 'Текст' },
                {
                  key: 'status',
                  title: 'Статус',
                  render: (row) => <NotificationStatus status={row.status} />
                },
                { key: 'createdAt', title: 'Создано', render: (row) => formatDate(row.createdAt) }
              ]}
              rows={loading ? [] : items}
              rowKey={(row) => row.id}
              rowActions={(row) =>
                row.status === 'read'
                  ? []
                  : [{ label: 'Отметить прочитанным', onSelect: () => void markRead(row.id) }]
              }
              emptyMessage={loading ? 'Загружаем уведомления…' : 'Уведомлений пока нет'}
              {...(loading ? {} : { emptyHint: emptyHint(filter) })}
            />
          </div>
        ) : null}
        {!error && totalPages > 1 ? (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        ) : null}
      </SectionCard>
      <PushSettingsScreen />
    </PageContainer>
  );
}
