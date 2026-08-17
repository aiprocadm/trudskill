import { LearnersListScreen } from '../../src/features/learners/learners-list-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

/*
 * Эталонный реестр Фазы 2 (features/learners/learners-list-screen.tsx) был построен
 * в PR #493, но маршрут на него не переключили — страница продолжала отдавать
 * дореформенный экран с дублирующим списком ссылок и статусами-кодами.
 * ТЗ §8.2: page.tsx ≤20 строк, экран живёт в features/learners/.
 */
export default function LearnersPage() {
  return (
    <ProtectedPage>
      <LearnersListScreen />
    </ProtectedPage>
  );
}
