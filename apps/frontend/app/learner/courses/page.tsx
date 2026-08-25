import { LearnerCoursesScreen } from '../../../src/features/learner-courses/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerCoursesPage() {
  return (
    <ProtectedPage>
      <LearnerCoursesScreen />
    </ProtectedPage>
  );
}
