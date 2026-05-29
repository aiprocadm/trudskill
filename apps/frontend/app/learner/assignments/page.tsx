import { AssignmentsListScreen } from '../../../src/features/practical-submissions/assignments-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerAssignmentsPage() {
  return (
    <ProtectedPage>
      <AssignmentsListScreen />
    </ProtectedPage>
  );
}
