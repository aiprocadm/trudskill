import { AdminCockpitScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminCockpitPage() {
  return (
    <ProtectedPage>
      <AdminCockpitScreen />
    </ProtectedPage>
  );
}
