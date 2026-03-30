import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';

const learnerActions = [
  'Создать и редактировать draft-заявку',
  'Загрузить и проверить комплект файлов',
  'Подать заявку на НЭП',
  'Отслеживать статусы и причины отклонения',
  'Запросить reuse ранее approved-заявки'
];

const staffActions = [
  'Принять заявку в review',
  'Верифицировать файлы и метаданные',
  'Approve / reject c юридически значимым предупреждением',
  'Перейти к запуску signing process по связанному документу'
];

const statuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'reused'];

export default function EsignApplicationsPage() {
  return (
    <ProtectedPage requiredPermissions={['esign.applications.read']}>
      <PageContainer>
        <PageHeader title="НЭП — заявки" subtitle="Learner и staff контуры в юридически значимом процессе" />

        <SectionCard title="Жизненный цикл заявки">
          <ul>{statuses.map((status) => <li key={status}>{status}</li>)}</ul>
          <p>Все переходы проверяются на backend state machine, UI показывает только доступные действия.</p>
        </SectionCard>

        <SectionCard title="Сценарий слушателя">
          <ul>{learnerActions.map((action) => <li key={action}>{action}</li>)}</ul>
        </SectionCard>

        <SectionCard title="Сценарий сотрудника">
          <ul>{staffActions.map((action) => <li key={action}>{action}</li>)}</ul>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
