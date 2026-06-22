import { PaymentProviderSettingsScreen } from '../../../../src/features/payments/settings-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default function AdminPaymentSettingsPage() {
  return (
    <ProtectedPage>
      <PaymentProviderSettingsScreen />
    </ProtectedPage>
  );
}
