import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { ConfirmDialogFoundation } from '../../src/components/foundation';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Аудит" subtitle="Раздел подключен в route-map и использует общие guard и shell-обёртки" />
        <SectionCard title="Состояние раздела">
          <p>Audit UI подключен как защищённый модуль и готов к наполнению сценариями и таблицами расследований.</p>
        </SectionCard>
        <SectionCard title="Notifications / Confirm placeholders">
          <p>Notifications placeholder</p>
          <ConfirmDialogFoundation />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
