import { CoursePreviewScreen } from '../../../../src/features/courses/course-preview-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default async function CoursePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <CoursePreviewScreen id={id} />
    </ProtectedPage>
  );
}
