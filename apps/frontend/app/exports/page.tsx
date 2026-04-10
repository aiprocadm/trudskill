import { ExportTasksScreen } from '../../src/features/integrations/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ExportsPage() {
  return (
    <ProtectedPage>
      <ExportTasksScreen />
    </ProtectedPage>
  );
}
