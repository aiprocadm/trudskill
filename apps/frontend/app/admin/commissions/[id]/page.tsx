import { CommissionDetailsScreen } from '../../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default async function AdminCommissionDetailsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <CommissionDetailsScreen id={id} />
    </ProtectedPage>
  );
}
