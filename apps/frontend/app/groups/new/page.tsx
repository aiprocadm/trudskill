import { GroupCreateScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function GroupCreatePage() {
  return <ProtectedPage><GroupCreateScreen /></ProtectedPage>;
}
