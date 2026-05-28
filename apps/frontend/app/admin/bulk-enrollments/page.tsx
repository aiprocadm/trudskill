import { BulkImportScreen } from '../../../src/features/bulk-enrollments/bulk-import-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminBulkEnrollmentsPage() {
  return (
    <ProtectedPage>
      <BulkImportScreen />
    </ProtectedPage>
  );
}
