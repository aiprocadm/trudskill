import { QuestionBankDetailScreen } from '../../../../src/features/assessment-admin/question-bank-detail-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminQuestionBankDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <QuestionBankDetailScreen bankId={id} />
    </ProtectedPage>
  );
}
