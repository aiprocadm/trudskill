import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { ConfirmDialogFoundation, RegistryFoundation } from '../../src/components/foundation';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Registry placeholder" subtitle="Песочница для проверки registry foundation и базовых guard-сценариев" />
        <SectionCard title="Foundation wrappers">
          <RegistryFoundation />
        </SectionCard>
        <SectionCard title="Notifications / Confirm placeholders">
          <p>Notifications placeholder</p>
          <ConfirmDialogFoundation />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
