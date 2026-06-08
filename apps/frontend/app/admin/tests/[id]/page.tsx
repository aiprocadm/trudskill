import { TestBuilderScreen } from '../../../../src/features/assessment-admin/test-builder-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTestBuilderPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <TestBuilderScreen testId={id} />
    </ProtectedPage>
  );
}
