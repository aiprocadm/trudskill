import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { IntegrationSettingsScreen } from '../../src/features/integrations/screens';

export default function IntegrationsPage() {
  return (
    <ProtectedPage>
      <IntegrationSettingsScreen />
    </ProtectedPage>
  );
}
