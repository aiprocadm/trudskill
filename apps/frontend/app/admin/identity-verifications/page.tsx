import { AdminIdentityQueueScreen } from '../../../src/features/identity-verification/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminIdentityVerificationsPage() {
  return (
    <ProtectedPage>
      <AdminIdentityQueueScreen />
    </ProtectedPage>
  );
}
