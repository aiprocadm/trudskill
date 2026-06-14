import { ReportBuilderScreen } from '../../../../src/features/report-builder/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default function AdminReportBuilderPage() {
  return (
    <ProtectedPage>
      <ReportBuilderScreen />
    </ProtectedPage>
  );
}
