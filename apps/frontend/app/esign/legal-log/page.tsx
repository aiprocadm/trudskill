import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';

const filters = ['entity_type/entity_id', 'actor', 'event_type', 'date range'];
const keyEvents = [
  'Создание и подача заявки',
  'Старт review и решение approve/reject',
  'Создание и запуск signing process',
  'Приглашение, просмотр, подпись/отказ участника',
  'Завершение/ошибка процесса и фиксация финального артефакта'
];

export default function EsignLegalLogPage() {
  return (
    <ProtectedPage requiredPermissions={['esign.legal.read']}>
      <PageContainer>
        <PageHeader title="Legal log" subtitle="Append-only реестр юридически значимых событий" />

        <SectionCard title="Фильтры расследования">
          <ul>{filters.map((filter) => <li key={filter}>{filter}</li>)}</ul>
        </SectionCard>

        <SectionCard title="Ключевые события">
          <ul>{keyEvents.map((event) => <li key={event}>{event}</li>)}</ul>
          <p>Журнал работает отдельно от административного audit log и не поддерживает update/delete.</p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
