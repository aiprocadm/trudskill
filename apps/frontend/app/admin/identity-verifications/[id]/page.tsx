import { AdminIdentityDetailScreen } from '../../../../src/features/identity-verification/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface AdminIdentityDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminIdentityDetailPage({ params }: AdminIdentityDetailPageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <AdminIdentityDetailScreen id={id} />
    </ProtectedPage>
  );
}
