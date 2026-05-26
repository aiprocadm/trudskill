import { LicensesView } from '../../../src/features/licenses/licenses-list';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminLicensesPage() {
  return (
    <ProtectedPage>
      <LicensesView />
    </ProtectedPage>
  );
}
