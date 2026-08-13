import { SettingsScreen } from '../../src/features/settings/settings-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function SettingsPage() {
  return (
    <ProtectedPage>
      <SettingsScreen />
    </ProtectedPage>
  );
}
