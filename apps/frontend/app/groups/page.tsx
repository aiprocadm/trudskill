import { GroupsPageScreen } from '../../src/features/groups/groups-list-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function GroupsPage() {
  return (
    <ProtectedPage>
      <GroupsPageScreen />
    </ProtectedPage>
  );
}
