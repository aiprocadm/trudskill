import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { ExportTasksScreen } from '../../src/features/integrations/screens';

export default function ExportsPage() {
  return (
    <ProtectedPage>
      <ExportTasksScreen />
    </ProtectedPage>
  );
}
