import { QuestionBankDetailScreen } from '../../../../src/features/assessment-admin/question-bank-detail-screen';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface PageProps {
  params: { id: string };
}

export default function AdminQuestionBankDetailPage({ params }: PageProps) {
  return (
    <ProtectedPage>
      <QuestionBankDetailScreen bankId={params.id} />
    </ProtectedPage>
  );
}
