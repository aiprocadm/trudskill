import { AssignmentDetailScreen } from '../../../../src/features/assessment-admin/assignment-detail-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface PageProps {
  params: { id: string };
}

export default function AdminAssignmentDetailPage({ params }: PageProps) {
  return (
    <ProtectedPage>
      <AssignmentDetailScreen assignmentId={params.id} />
    </ProtectedPage>
  );
}
