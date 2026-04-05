import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';

export default function CounterpartyPortalPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Кабинет контрагента (обзор для персонала)" subtitle="П. 5.11 ТЗ — отдельный контур для юрлица; здесь — навигация к данным" />
        <SectionCard title="Связанные данные">
          <TzLinks
            items={[
              { href: '/counterparties', label: 'Карточки контрагентов' },
              { href: '/learners', label: 'Слушатели' },
              { href: '/groups', label: 'Группы и зачисления' }
            ]}
          />
        </SectionCard>
        <SectionCard title="Примечание">
          <p style={{ margin: 0, color: '#52525b', lineHeight: 1.55 }}>
            Полноценный изолированный ЛК контрагента потребует отдельной роли и маршрутов; текущая страница помогает методисту быстро перейти к связанным реестрам.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
