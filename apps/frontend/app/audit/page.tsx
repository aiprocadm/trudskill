import { AuditScreen } from '../../src/features/audit/audit-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function AuditPage() {
  return (
    <ProtectedPage>
      <AuditScreen />
    </ProtectedPage>
  );
}
