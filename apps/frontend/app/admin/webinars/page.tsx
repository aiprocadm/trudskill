import { WebinarsAdminScreen } from '../../../src/features/webinars/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminWebinarsPage() {
  return (
    <ProtectedPage>
      <WebinarsAdminScreen />
    </ProtectedPage>
  );
}
