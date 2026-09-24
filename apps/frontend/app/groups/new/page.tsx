import { GroupWizardScreen } from '../../../src/features/groups/group-wizard/group-wizard-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function GroupCreatePage() {
  return (
    <ProtectedPage>
      <GroupWizardScreen />
    </ProtectedPage>
  );
}
