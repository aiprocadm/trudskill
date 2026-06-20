import { MyWebinarsScreen } from '../../../src/features/webinars/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerWebinarsPage() {
  return (
    <ProtectedPage>
      <MyWebinarsScreen />
    </ProtectedPage>
  );
}
