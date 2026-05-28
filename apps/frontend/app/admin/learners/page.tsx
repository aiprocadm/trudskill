import { LearnersListScreen } from '../../../src/features/learners/learners-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminLearnersPage() {
  return (
    <ProtectedPage>
      <LearnersListScreen />
    </ProtectedPage>
  );
}
