import { CounterpartiesPageScreen } from '../../src/features/counterparties/counterparties-screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function CounterpartiesPage() {
  return (
    <ProtectedPage>
      <CounterpartiesPageScreen />
    </ProtectedPage>
  );
}
