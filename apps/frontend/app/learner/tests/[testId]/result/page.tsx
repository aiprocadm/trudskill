import { TestResultScreen } from '../../../../../src/features/test-player/test-result-screen';
import { ProtectedPage } from '../../../../../src/widgets/shell/protected-page';

export default async function LearnerResultPage({
  params,
  searchParams
}: {
  params: Promise<{ testId: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const { testId } = await params;
  const { attemptId } = await searchParams;
  return (
    <ProtectedPage>
      <TestResultScreen testId={testId} attemptId={attemptId ?? ''} />
    </ProtectedPage>
  );
}
