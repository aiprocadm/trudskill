import { LearnerDetailsScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default async function LearnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <LearnerDetailsScreen id={id} />
    </ProtectedPage>
  );
}
