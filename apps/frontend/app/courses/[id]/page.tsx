import { CourseDetailsScreen } from '../../../src/features/courses/courses-screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <CourseDetailsScreen id={id} />
    </ProtectedPage>
  );
}
