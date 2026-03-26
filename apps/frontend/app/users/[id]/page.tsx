import { UserDetailsScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProtectedPage><UserDetailsScreen id={id} /></ProtectedPage>;
}
