import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';

const processStatuses = ['draft', 'prepared', 'awaiting_participants', 'in_signing', 'signed', 'failed', 'cancelled'];
const participantStatuses = ['pending', 'invited', 'viewed', 'signed', 'rejected', 'skipped', 'expired'];

export default function EsignProcessesPage() {
  return (
    <ProtectedPage requiredPermissions={['esign.processes.read']}>
      <PageContainer>
        <PageHeader title="Подписание документов" subtitle="Процессы, участники, очередность и timeline событий" />

        <SectionCard title="Статусы процесса">
          <ul>{processStatuses.map((status) => <li key={status}>{status}</li>)}</ul>
        </SectionCard>

        <SectionCard title="Статусы участников">
          <ul>{participantStatuses.map((status) => <li key={status}>{status}</li>)}</ul>
          <p>Для sequential-процессов подписание вне очереди блокируется backend-правилами.</p>
        </SectionCard>

        <SectionCard title="Иммутабельность артефакта">
          <p>После статуса signed финальный артефакт фиксируется и больше не может быть перезаписан.</p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
