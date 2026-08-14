import { GovExportScreen } from '../../src/features/gov-export/gov-export-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function GovExportPage() {
  return (
    <ProtectedPage>
      <GovExportScreen />
    </ProtectedPage>
  );
}
