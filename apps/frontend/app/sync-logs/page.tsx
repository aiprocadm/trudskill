import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { SyncLogsScreen } from '../../src/features/integrations/screens';

export default function SyncLogsPage() {
  return (
    <ProtectedPage>
      <SyncLogsScreen />
    </ProtectedPage>
  );
}
