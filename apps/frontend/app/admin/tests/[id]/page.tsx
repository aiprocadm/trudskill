import { TestBuilderScreen } from '../../../../src/features/assessment-admin/test-builder-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface PageProps {
  params: { id: string };
}

export default function AdminTestBuilderPage({ params }: PageProps) {
  return (
    <ProtectedPage>
      <TestBuilderScreen testId={params.id} />
    </ProtectedPage>
  );
}
