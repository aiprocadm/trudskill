import { RecertificationQueueScreen } from '../../../src/features/recertification/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminRecertificationPage() {
  return (
    <ProtectedPage>
      <RecertificationQueueScreen />
    </ProtectedPage>
  );
}
