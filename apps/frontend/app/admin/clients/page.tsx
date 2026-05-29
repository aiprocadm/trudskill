import { ClientsListScreen } from '../../../src/features/clients/clients-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminClientsPage() {
  return (
    <ProtectedPage>
      <ClientsListScreen />
    </ProtectedPage>
  );
}
