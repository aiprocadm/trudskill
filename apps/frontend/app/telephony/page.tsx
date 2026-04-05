import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

export default function TelephonyPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Телефония" subtitle="П. 5.20 ТЗ (опционально II–III этап) — облачная АТС, внутренние номера, CRM" />
        <SectionCard title="Статус">
          <p style={{ margin: 0, color: '#52525b', lineHeight: 1.55 }}>Модуль не подключён. Параметры интеграции будут храниться в настройках учебного центра и шифроваться как секреты.</p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
