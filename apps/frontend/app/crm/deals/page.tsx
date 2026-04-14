import { FeatureComingSoon } from '../../../src/components/feature-coming-soon';
import { PageContainer, PageHeader } from '../../../src/components/state-wrappers';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function CrmDealsPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="CRM · Сделки"
          subtitle="П. 5.21 ТЗ — стадии, контрагенты, промокоды, договоры"
        />
        <FeatureComingSoon
          progress={40}
          eta="Спринт 3"
          roles={['admin', 'sales_manager', 'methodist']}
          availableNow={['Реестр контрагентов', 'Группы и назначения', 'Курсы и статусы обучения']}
          links={[
            { href: '/counterparties', label: 'Открыть Контрагенты' },
            { href: '/groups', label: 'Открыть Группы' },
            { href: '/courses', label: 'Открыть Курсы' }
          ]}
        />
      </PageContainer>
    </ProtectedPage>
  );
}
