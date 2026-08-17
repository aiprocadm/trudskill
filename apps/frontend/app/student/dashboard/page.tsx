import { StudentDashboardScreen } from '../../../src/features/role-dashboards/role-widgets';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function StudentDashboardPage() {
  return (
    <ProtectedPage>
      <StudentDashboardScreen />
    </ProtectedPage>
  );
}
