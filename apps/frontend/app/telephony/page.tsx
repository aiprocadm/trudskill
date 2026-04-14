import { FeatureComingSoon } from '../../src/components/feature-coming-soon';
import { PageContainer, PageHeader } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function TelephonyPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Телефония"
          subtitle="П. 5.20 ТЗ (опционально II–III этап) — облачная АТС, внутренние номера, CRM"
        />
        <FeatureComingSoon
          progress={20}
          eta="Спринт 3"
          roles={['admin', 'sales_manager']}
          availableNow={['Реестр контрагентов', 'CRM-блок навигации', 'Интеграционные credentials']}
          links={[
            { href: '/crm/deals', label: 'Открыть CRM · Сделки' },
            { href: '/integrations', label: 'Открыть Интеграции' }
          ]}
        />
      </PageContainer>
    </ProtectedPage>
  );
}
