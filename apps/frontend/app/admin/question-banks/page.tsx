import { QuestionBanksListScreen } from '../../../src/features/assessment-admin/question-banks-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminQuestionBanksPage() {
  return (
    <ProtectedPage>
      <QuestionBanksListScreen />
    </ProtectedPage>
  );
}
