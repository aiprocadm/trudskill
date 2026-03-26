import { CourseCreateScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function CourseCreatePage() {
  return <ProtectedPage><CourseCreateScreen /></ProtectedPage>;
}
