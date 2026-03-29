'use client';

import { useEffect, useState } from 'react';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { useAuth } from '../../src/features/auth/context';
import { communicationApi, useNotificationsRealtime } from '../../src/features/communication/hooks';

export default function NotificationsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const refresh = () => session && communicationApi.listNotifications(session).then((rows) => setItems(rows));
  useEffect(() => { void refresh(); }, [session]);
  useNotificationsRealtime(() => void refresh());

  return (
    <ProtectedPage>
      <div style={{ padding: 16, display: 'grid', gap: 8 }}>
        <h1>Notification center</h1>
        <button onClick={() => session && communicationApi.markAllRead(session).then(() => void refresh())}>Mark all as read</button>
        {items.map((item) => (
          <article key={item.id} style={{ border: '1px solid #ddd', padding: 12 }}>
            <strong>{item.subjectText}</strong>
            <p>{item.bodyText}</p>
            <small>{item.status}</small>
            <div>
              <button onClick={() => session && communicationApi.markRead(session, item.id).then(() => void refresh())}>Mark as read</button>
            </div>
          </article>
        ))}
      </div>
    </ProtectedPage>
  );
}
