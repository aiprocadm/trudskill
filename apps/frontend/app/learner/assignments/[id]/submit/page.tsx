import { SubmissionScreen } from '../../../../../src/features/practical-submissions/submission-screen';
import { ProtectedPage } from '../../../../../src/widgets/shell/protected-page';

export default async function LearnerAssignmentSubmitPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <SubmissionScreen assignmentId={id} />
    </ProtectedPage>
  );
}
