import { TestsListScreen } from '../../../src/features/assessment-admin/tests-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminTestsPage() {
  return (
    <ProtectedPage>
      <TestsListScreen />
    </ProtectedPage>
  );
}
