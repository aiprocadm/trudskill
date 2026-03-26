import { GroupsPageScreen } from '../../src/features/mvp/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function GroupsPage() {
  return <ProtectedPage><GroupsPageScreen /></ProtectedPage>;
}
