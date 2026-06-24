import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function MailingsPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Рассылки и уведомления"
          subtitle="Приглашения, доступы и рассылки через почтовые сервисы"
        />
        <SectionCard title="Текущие возможности">
          <TzLinks
            items={[
              {
                href: '/notifications',
                label: 'Центр уведомлений в приложении',
                description: 'In-app уведомления и realtime'
              },
              {
                href: '/integrations',
                label: 'Настройки интеграций',
                description: 'Расширение под SMTP/API рассылок'
              }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
