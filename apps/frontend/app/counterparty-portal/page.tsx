import { FeatureComingSoon } from '../../src/components/feature-coming-soon';
import { PageContainer, PageHeader } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function CounterpartyPortalPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Кабинет контрагента (обзор для персонала)"
          subtitle="П. 5.11 ТЗ — отдельный контур для юрлица; здесь — навигация к данным"
        />
        <FeatureComingSoon
          progress={45}
          eta="Спринт 3"
          roles={['counterparty_manager', 'methodist', 'admin']}
          availableNow={['Реестр контрагентов', 'Слушатели и их статусы', 'Группы и зачисления']}
          links={[
            { href: '/counterparties', label: 'Открыть Контрагенты' },
            { href: '/learners', label: 'Открыть Слушатели' },
            { href: '/groups', label: 'Открыть Группы' }
          ]}
        />
      </PageContainer>
    </ProtectedPage>
  );
}
