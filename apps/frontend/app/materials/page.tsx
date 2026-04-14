import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function MaterialsHubPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Учебный контент" subtitle="Модули и материалы курса (п. 5.5 ТЗ)" />
        <SectionCard title="Навигация">
          <TzLinks
            items={[
              {
                href: '/courses',
                label: 'Курсы и версии',
                description: 'Создание версии курса и привязка модулей через карточку курса'
              },
              {
                href: '/directions',
                label: 'Направления',
                description: 'Иерархия «направление — курс» (п. 5.4 ТЗ)'
              }
            ]}
          />
        </SectionCard>
        <SectionCard title="API">
          <p className="ui-prose-muted">
            Список модулей: <code>GET /modules</code>, материалов: <code>GET /materials</code>{' '}
            (права <code>materials.read</code>). Минимальное время просмотра и обязательность — поля
            сущностей на бэкенде MVP.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
