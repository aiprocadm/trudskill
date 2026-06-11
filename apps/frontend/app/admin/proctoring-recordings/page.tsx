import { AdminProctoringQueueScreen } from '../../../src/features/proctoring/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminProctoringRecordingsPage() {
  return (
    <ProtectedPage>
      <AdminProctoringQueueScreen />
    </ProtectedPage>
  );
}
