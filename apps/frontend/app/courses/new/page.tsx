import { CourseWizardScreen } from '../../../src/features/course-wizard/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function CourseCreatePage() {
  return (
    <ProtectedPage>
      <CourseWizardScreen />
    </ProtectedPage>
  );
}
