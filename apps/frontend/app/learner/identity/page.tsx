import { LearnerIdentityScreen } from '../../../src/features/identity-verification/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerIdentityPage() {
  return (
    <ProtectedPage>
      <LearnerIdentityScreen />
    </ProtectedPage>
  );
}
