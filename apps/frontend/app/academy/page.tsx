import Link from 'next/link';

import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function AcademyHubPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Учебный центр"
          subtitle="Реквизиты учебного центра, комиссия, шаблоны документов и нумерация"
        />
        <SectionCard title="Ключевые настройки">
          <TzLinks
            items={[
              {
                href: '/academy/requisites',
                label: 'Данные учебного заведения и реквизиты',
                description:
                  'Наименование, адреса, ИНН, контакты, часовой пояс, расширяемый payload из API /tenant/*'
              },
              {
                href: '/academy/commission',
                label: 'Члены комиссии, председатель и секретарь',
                description:
                  'Справочник комиссии; привязка к протоколам и приказам — в развитии документооборота'
              },
              {
                href: '/documents',
                label: 'Шаблоны и генерация документов',
                description: 'Реестр шаблонов, задания генерации и нумерация документов'
              },
              {
                href: '/settings',
                label: 'Общие настройки и UI-песочница',
                description: 'Расширение под параметры документооборота и интеграций'
              }
            ]}
          />
        </SectionCard>
        <SectionCard title="Связанные модули">
          <p className="ui-prose-muted">
            Нумерация приказов и протоколов: см. модуль документов и бэкенд <code>documents</code>.
            Массовая выгрузка логинов: раздел <Link href="/users">Пользователи</Link>, API IAM.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
