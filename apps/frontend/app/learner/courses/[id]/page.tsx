import { LearnerCourseDetailsScreen } from '../../../../src/features/learner-courses/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default async function LearnerCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <LearnerCourseDetailsScreen id={id} />
    </ProtectedPage>
  );
}
