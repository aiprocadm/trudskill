import { CoursesPageScreen } from '../../src/features/courses/courses-screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function CoursesPage() {
  return (
    <ProtectedPage>
      <CoursesPageScreen />
    </ProtectedPage>
  );
}
