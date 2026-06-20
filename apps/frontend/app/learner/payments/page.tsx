import { MyPaymentsScreen } from '../../../src/features/payments/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerPaymentsPage() {
  return (
    <ProtectedPage>
      <MyPaymentsScreen />
    </ProtectedPage>
  );
}
