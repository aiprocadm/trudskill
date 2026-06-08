import { ClientDetailScreen } from '../../../../src/features/clients/client-detail-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface AdminClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientDetailPage({ params }: AdminClientDetailPageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <ClientDetailScreen clientId={id} />
    </ProtectedPage>
  );
}
