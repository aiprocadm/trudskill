import { GroupCreateScreen } from '../../../src/features/groups/group-create-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function GroupCreatePage() {
  return (
    <ProtectedPage>
      <GroupCreateScreen />
    </ProtectedPage>
  );
}
