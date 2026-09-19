import { ManagerHomeScreen } from '../../src/features/manager-home/manager-home-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ManagerHomePage() {
  return (
    <ProtectedPage>
      <ManagerHomeScreen />
    </ProtectedPage>
  );
}
