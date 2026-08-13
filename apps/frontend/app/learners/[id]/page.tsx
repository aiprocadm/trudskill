import { LearnerDetailsScreen } from '../../../src/features/learners/learner-detail-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default async function LearnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <LearnerDetailsScreen id={id} />
    </ProtectedPage>
  );
}
