import { TestsListScreen } from '../../../src/features/test-player/tests-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerTestsPage() {
  return (
    <ProtectedPage>
      <TestsListScreen />
    </ProtectedPage>
  );
}
