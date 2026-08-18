import { CounterpartyPortalScreen } from '../../src/features/counterparty-portal/portal-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

/* IA-001: экран переехал в features/counterparty-portal/, страница — тонкая обёртка. */
export default function CounterpartyPortalPage() {
  return (
    <ProtectedPage>
      <CounterpartyPortalScreen />
    </ProtectedPage>
  );
}
