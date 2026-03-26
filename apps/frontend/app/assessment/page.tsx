import { AssessmentDashboardScreen } from '../../src/features/mvp/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function AssessmentPage() {
  return <ProtectedPage><AssessmentDashboardScreen /></ProtectedPage>;
}
