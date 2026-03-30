import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { ConfirmDialogFoundation, FormFoundation } from '../../src/components/foundation';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Form placeholder" subtitle="Изолированная зона для сборки form foundation и confirm-сценариев" />
        <SectionCard title="Foundation wrappers">
          <FormFoundation />
        </SectionCard>
        <SectionCard title="Notifications / Confirm placeholders">
          <p>Notifications placeholder</p>
          <ConfirmDialogFoundation />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
