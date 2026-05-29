import { ClientDetailScreen } from '../../../../src/features/clients/client-detail-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface AdminClientDetailPageProps {
  params: { id: string };
}

export default function AdminClientDetailPage({ params }: AdminClientDetailPageProps) {
  return (
    <ProtectedPage>
      <ClientDetailScreen clientId={params.id} />
    </ProtectedPage>
  );
}
