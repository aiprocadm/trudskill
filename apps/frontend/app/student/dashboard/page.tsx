import { StudentDashboardScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function StudentDashboardPage() {
  return (
    <ProtectedPage>
      <StudentDashboardScreen />
    </ProtectedPage>
  );
}
