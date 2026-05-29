import { AssignmentsListScreen } from '../../../src/features/assessment-admin/assignments-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminAssignmentsPage() {
  return (
    <ProtectedPage>
      <AssignmentsListScreen />
    </ProtectedPage>
  );
}
