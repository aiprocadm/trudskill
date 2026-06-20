import { WebinarProviderSettingsScreen } from '../../../../src/features/webinars/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default function AdminWebinarSettingsPage() {
  return (
    <ProtectedPage>
      <WebinarProviderSettingsScreen />
    </ProtectedPage>
  );
}
