import { TestAttemptScreen } from '../../../../../../src/features/test-player/test-attempt-screen';
import { FocusPage } from '../../../../../../src/widgets/shell/focus-page';

/*
 * Экзамен идёт в СВОЁМ режиме, а не в общей оболочке (ТЗ 6.2 / С2): без меню, поиска,
 * «Уведомлений», переключателя темы и кнопки «Выйти» над вопросами. Выход из режима
 * рисует сам экран и спрашивает подтверждение.
 */
export default async function LearnerAttemptPage({
  params
}: {
  params: Promise<{ testId: string; attemptId: string }>;
}) {
  const { testId, attemptId } = await params;
  return (
    <FocusPage>
      <TestAttemptScreen testId={testId} attemptId={attemptId} />
    </FocusPage>
  );
}
