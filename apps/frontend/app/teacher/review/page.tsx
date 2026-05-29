import { ReviewerActionsScreen } from '../../../src/features/reviewer-actions/reviewer-actions-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function TeacherReviewQueuePage() {
  return (
    <ProtectedPage>
      <ReviewerActionsScreen />
    </ProtectedPage>
  );
}
