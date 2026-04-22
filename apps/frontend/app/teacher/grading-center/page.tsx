import { TeacherGradingCenterScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function TeacherGradingCenterPage() {
  return (
    <ProtectedPage>
      <TeacherGradingCenterScreen />
    </ProtectedPage>
  );
}
