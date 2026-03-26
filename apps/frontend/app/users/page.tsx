import { UsersPageScreen } from '../../src/features/mvp/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function UsersPage() {
  return <ProtectedPage><UsersPageScreen /></ProtectedPage>;
}
