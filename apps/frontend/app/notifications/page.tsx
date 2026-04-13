'use client';

import { DataTable, FilterBar, LoadingState } from '@cdoprof/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import {
  communicationApi,
  useNotificationsList,
  useNotificationsRealtime
} from '../../src/features/communication/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function NotificationsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const { data, loading, error, refetch } = useNotificationsList(page, 20, filter);

  useNotificationsRealtime(() => void refetch());

  const markAllRead = async () => {
    if (!session) return;
    await communicationApi.markAllRead(session);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = async (id: string) => {
    if (!session) return;
    await communicationApi.markRead(session, id);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Notification center"
          actions={
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => void markAllRead()}
            >
              Mark all as read
            </button>
          }
        />
        <SectionCard title="Уведомления">
          <FilterBar>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="">Все</option>
              <option value="unread">Непрочитанные</option>
            </select>
          </FilterBar>
          {loading ? <LoadingState message="Загрузка уведомлений…" /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !data?.items.length ? (
            <SectionEmpty message="Уведомления отсутствуют" />
          ) : null}
          {data?.items.length ? (
            <DataTable
              columns={[
                { key: 'subjectText', title: 'Тема' },
                { key: 'bodyText', title: 'Текст' },
                { key: 'status', title: 'Статус' },
                { key: 'createdAt', title: 'Создано' }
              ]}
              rows={data.items}
            />
          ) : null}
          <div className="ui-inline">
            <button type="button" disabled={page <= 1} onClick={() => setPage((curr) => curr - 1)}>
              Назад
            </button>
            <span>Стр. {data?.page ?? page}</span>
            <button
              type="button"
              disabled={Boolean(data && data.page * data.pageSize >= data.total)}
              onClick={() => setPage((curr) => curr + 1)}
            >
              Далее
            </button>
          </div>
          <div className="ui-stack">
            {data?.items
              .filter((item) => item.status !== 'read')
              .map((item) => (
                <button key={item.id} type="button" onClick={() => void markRead(item.id)}>
                  Отметить «{item.subjectText}» как прочитанное
                </button>
              ))}
          </div>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
