import { DirectionsPageScreen } from '../../src/features/mvp/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function DirectionsPage() {
  return <ProtectedPage><DirectionsPageScreen /></ProtectedPage>;
}
