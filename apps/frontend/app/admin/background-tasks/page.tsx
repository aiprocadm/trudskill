import { BackgroundTasksScreen } from '../../../src/features/background-tasks/background-tasks-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function BackgroundTasksPage() {
  return (
    <ProtectedPage>
      <BackgroundTasksScreen />
    </ProtectedPage>
  );
}
