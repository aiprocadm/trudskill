import { AnalyticsDashboardScreen } from '../../../src/features/analytics/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AnalyticsPage() {
  return (
    <ProtectedPage>
      <AnalyticsDashboardScreen />
    </ProtectedPage>
  );
}
