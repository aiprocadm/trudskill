import { TestAttemptScreen } from '../../../../../../src/features/test-player/test-attempt-screen';
import { ProtectedPage } from '../../../../../../src/widgets/shell/protected-page';

export default async function LearnerAttemptPage({
  params
}: {
  params: Promise<{ testId: string; attemptId: string }>;
}) {
  const { testId, attemptId } = await params;
  return (
    <ProtectedPage>
      <TestAttemptScreen testId={testId} attemptId={attemptId} />
    </ProtectedPage>
  );
}
