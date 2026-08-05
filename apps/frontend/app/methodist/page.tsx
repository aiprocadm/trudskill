import { MethodistHomeScreen } from '../../src/features/methodist-home/methodist-home-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function MethodistHomePage() {
  return (
    <ProtectedPage>
      <MethodistHomeScreen />
    </ProtectedPage>
  );
}
