import { TasksListScreen } from '../../src/features/tasks/tasks-list-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

/** `/tasks` — задачи сотрудников (ТЗ перехода с CDOPROF, МГ-G2.3, `TPL-001`). */
export default function TasksPage() {
  return (
    <ProtectedPage>
      <TasksListScreen />
    </ProtectedPage>
  );
}
