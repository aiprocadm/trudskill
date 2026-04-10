'use client';

import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { communicationApi, useNotificationsRealtime } from '../../src/features/communication/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function NotificationsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof communicationApi.listNotifications>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await communicationApi.listNotifications(session);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить уведомления');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [session]);
  useNotificationsRealtime(() => void refresh());

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Notification center"
          actions={
            <button
              onClick={() =>
                session && communicationApi.markAllRead(session).then(() => void refresh())
              }
            >
              Mark all as read
            </button>
          }
        />
        <SectionCard title="Уведомления">
          {loading ? <p>Загрузка...</p> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !items.length ? <SectionEmpty message="Уведомления отсутствуют" /> : null}
          <div className="ui-stack" style={{ gap: 10 }}>
            {items.map((item) => (
              <article key={item.id} className="ui-section-card">
                <strong>{item.subjectText}</strong>
                <p>{item.bodyText}</p>
                <small>{item.status}</small>
                <div>
                  <button
                    onClick={() =>
                      session &&
                      communicationApi.markRead(session, item.id).then(() => void refresh())
                    }
                  >
                    Mark as read
                  </button>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
