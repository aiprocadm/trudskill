import { LearnerHomeScreen } from '../../src/features/learner-home/learner-home-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function LearnerHomePage() {
  return (
    <ProtectedPage>
      <LearnerHomeScreen />
    </ProtectedPage>
  );
}
