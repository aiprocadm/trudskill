import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';
import { TzLinks } from '../../../src/components/tz/tz-links';

export default function CrmDealsPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="CRM · Сделки" subtitle="П. 5.21 ТЗ — стадии, контрагенты, промокоды, договоры (в разработке)" />
        <SectionCard title="План">
          <TzLinks
            items={[
              { href: '/counterparties', label: 'Контрагенты', description: 'Базовый реестр контрагентов уже доступен' },
              { href: '/groups', label: 'Группы', description: 'Привязка сделок к группам и курсам — следующий этап' }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
