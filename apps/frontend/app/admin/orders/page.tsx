import { OrdersScreen } from '../../../src/features/payments/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminOrdersPage() {
  return (
    <ProtectedPage>
      <OrdersScreen />
    </ProtectedPage>
  );
}
