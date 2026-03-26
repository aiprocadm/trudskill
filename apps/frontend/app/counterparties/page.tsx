import { CounterpartiesPageScreen } from '../../src/features/mvp/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function CounterpartiesPage() {
  return <ProtectedPage><CounterpartiesPageScreen /></ProtectedPage>;
}
