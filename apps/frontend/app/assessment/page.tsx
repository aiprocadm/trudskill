import { AssessmentDashboardScreen } from '../../src/features/assessment/assessment-dashboard-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function AssessmentPage() {
  return (
    <ProtectedPage>
      <AssessmentDashboardScreen />
    </ProtectedPage>
  );
}
