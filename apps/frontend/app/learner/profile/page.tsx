import { LearnerProfileScreen } from '../../../src/features/learner-profile/learner-profile-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerProfilePage() {
  return (
    <ProtectedPage>
      <LearnerProfileScreen />
    </ProtectedPage>
  );
}
