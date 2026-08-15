import { DirectionsPageScreen } from '../../src/features/directions/directions-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function DirectionsPage() {
  return (
    <ProtectedPage>
      <DirectionsPageScreen />
    </ProtectedPage>
  );
}
