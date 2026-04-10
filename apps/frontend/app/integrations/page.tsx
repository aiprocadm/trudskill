import { IntegrationSettingsScreen } from '../../src/features/integrations/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function IntegrationsPage() {
  return (
    <ProtectedPage>
      <IntegrationSettingsScreen />
    </ProtectedPage>
  );
}
