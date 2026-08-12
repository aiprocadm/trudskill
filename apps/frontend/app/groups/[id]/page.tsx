import { GroupDetailsScreen } from '../../../src/features/groups/group-details-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <GroupDetailsScreen id={id} />
    </ProtectedPage>
  );
}
