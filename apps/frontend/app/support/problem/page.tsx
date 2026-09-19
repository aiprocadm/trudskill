import { ProblemReportScreen } from '../../../src/features/support/problem-report-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

/**
 * «Сообщить о проблеме» (ТЗ «Стабилизация, UX и развитие», 15.5).
 *
 * Страница внутри оболочки: человек приходит сюда из меню, а не с улицы, и должен видеть, где
 * находится, — иначе после отправки обращения ему некуда вернуться.
 */
export default function ProblemReportPage() {
  return (
    <ProtectedPage>
      <ProblemReportScreen />
    </ProtectedPage>
  );
}
