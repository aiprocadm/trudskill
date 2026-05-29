import { ReviewerQueueScreen } from '../../../src/features/assessment-admin/reviewer-queue-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function TeacherReviewQueuePage() {
  return (
    <ProtectedPage>
      <ReviewerQueueScreen />
    </ProtectedPage>
  );
}
