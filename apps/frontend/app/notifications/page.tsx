'use client';

import { NotificationsScreen } from '../../src/features/communication/notifications-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

/* §15.1: в маршруте — только доступ и экран; вся разметка живёт в `features/communication`. */
export default function NotificationsPage() {
  return (
    <ProtectedPage>
      <NotificationsScreen />
    </ProtectedPage>
  );
}
