import { CommissionsPageScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminCommissionsPage() {
  return (
    <ProtectedPage>
      <CommissionsPageScreen />
    </ProtectedPage>
  );
}
