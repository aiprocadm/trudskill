import { AssignmentDetailScreen } from '../../../../src/features/assessment-admin/assignment-detail-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAssignmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <AssignmentDetailScreen assignmentId={id} />
    </ProtectedPage>
  );
}
