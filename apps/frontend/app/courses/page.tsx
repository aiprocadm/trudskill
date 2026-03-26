import { CoursesPageScreen } from '../../src/features/mvp/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function CoursesPage() {
  return <ProtectedPage><CoursesPageScreen /></ProtectedPage>;
}
