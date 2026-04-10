import { SyncLogsScreen } from '../../src/features/integrations/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function SyncLogsPage() {
  return (
    <ProtectedPage>
      <SyncLogsScreen />
    </ProtectedPage>
  );
}
