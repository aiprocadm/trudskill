import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { ConfirmDialogFoundation } from '../../src/components/foundation';
import { PageContainer, PageHeader, SectionCard, SectionEmpty } from '../../src/components/state-wrappers';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Protected empty module" subtitle="Заглушка для маршрутов, которые уже защищены, но ещё не реализованы" />
        <SectionCard title="Foundation wrappers">
          <SectionEmpty message="Модуль еще не реализован" />
        </SectionCard>
        <SectionCard title="Notifications / Confirm placeholders">
          <p>Notifications placeholder</p>
          <ConfirmDialogFoundation />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
