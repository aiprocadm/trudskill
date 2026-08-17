import { TeacherGradingCenterScreen } from '../../../src/features/role-dashboards/role-widgets';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function TeacherGradingCenterPage() {
  return (
    <ProtectedPage>
      <TeacherGradingCenterScreen />
    </ProtectedPage>
  );
}
