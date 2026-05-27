import { LearnerDocumentsScreen } from '../../../src/features/learner-documents/learner-documents-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerDocumentsPage() {
  return (
    <ProtectedPage>
      <LearnerDocumentsScreen />
    </ProtectedPage>
  );
}
