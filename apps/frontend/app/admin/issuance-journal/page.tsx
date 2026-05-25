import { IssuanceJournalView } from '../../../src/features/issuance-journal/issuance-journal';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminIssuanceJournalPage() {
  return (
    <ProtectedPage>
      <IssuanceJournalView />
    </ProtectedPage>
  );
}
