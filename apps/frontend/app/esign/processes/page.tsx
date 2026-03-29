import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';

const processStatuses = ['draft', 'prepared', 'awaiting_participants', 'in_signing', 'signed', 'failed', 'cancelled'];

export default function EsignProcessesPage() {
  return (
    <ProtectedPage requiredPermissions={['esign.processes.read']}>
      <PageContainer>
        <PageHeader title="Подписание документов" subtitle="Статусы процессов, участников и timeline" />
        <SectionCard title="Статусы подписания">
          <ul>{processStatuses.map((status) => <li key={status}>{status}</li>)}</ul>
          <p>Финальный артефакт immutable после перехода процесса в signed.</p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
