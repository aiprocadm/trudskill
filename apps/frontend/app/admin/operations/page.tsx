import { OperationsScreen } from '../../../src/features/operations/operations-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminOperationsPage() {
  return (
    <ProtectedPage>
      <OperationsScreen />
    </ProtectedPage>
  );
}
