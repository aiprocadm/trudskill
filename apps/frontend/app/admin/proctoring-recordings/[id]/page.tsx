import { AdminProctoringDetailScreen } from '../../../../src/features/proctoring/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface AdminProctoringDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProctoringDetailPage({
  params
}: AdminProctoringDetailPageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <AdminProctoringDetailScreen id={id} />
    </ProtectedPage>
  );
}
