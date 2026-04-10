import { ConfirmDialogFoundation } from '../../src/components/foundation';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Настройки" subtitle="Административный раздел с общим layout и защитой доступа по маршруту" />
        <SectionCard title="Состояние раздела">
          <p>Settings UI включён в навигацию и готов к постепенному заполнению доменными конфигурациями.</p>
        </SectionCard>
        <SectionCard title="Notifications / Confirm placeholders">
          <p>Notifications placeholder</p>
          <ConfirmDialogFoundation />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
