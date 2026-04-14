import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function TelephonyPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Телефония"
          subtitle="П. 5.20 ТЗ (опционально II–III этап) — облачная АТС, внутренние номера, CRM"
        />
        <SectionCard title="Статус">
          <p className="ui-prose-muted">
            Модуль не подключён. Параметры интеграции будут храниться в настройках учебного центра и
            шифроваться как секреты.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
