import { NotificationRecipientsScreen } from '../../../src/features/notification-recipients/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminNotificationSettingsPage() {
  return (
    <ProtectedPage>
      <NotificationRecipientsScreen />
    </ProtectedPage>
  );
}
