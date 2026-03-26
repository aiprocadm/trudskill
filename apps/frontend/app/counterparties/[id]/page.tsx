import { CounterpartyDetailsScreen } from '../../../src/features/mvp/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default async function CounterpartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProtectedPage><CounterpartyDetailsScreen id={id} /></ProtectedPage>;
}
