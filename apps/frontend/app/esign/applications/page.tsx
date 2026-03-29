import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';

const statuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'reused'];

export default function EsignApplicationsPage() {
  return (
    <ProtectedPage requiredPermissions={['esign.applications.read']}>
      <PageContainer>
        <PageHeader title="НЭП — заявки" subtitle="Личный кабинет и staff-review контур" />
        <SectionCard title="Жизненный цикл заявки">
          <ul>{statuses.map((status) => <li key={status}>{status}</li>)}</ul>
          <p>Критичные действия approve/reject/submit выполняются только после серверной валидации state machine.</p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
