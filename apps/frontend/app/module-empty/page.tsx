import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty
} from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Protected empty module"
          subtitle="Заглушка для маршрутов, которые уже защищены, но ещё не реализованы"
        />
        <SectionCard title="Foundation wrappers">
          <SectionEmpty message="Модуль еще не реализован" />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
