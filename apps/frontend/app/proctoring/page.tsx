import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ProctoringPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Прокторинг"
          subtitle="П. 5.16 ТЗ — проверка оборудования, сессия, протокол, интеграция с внешним сервисом"
        />
        <SectionCard title="Статус">
          <p className="ui-prose-muted">
            Контур проктора и хранение медиа не подключены. План: WebRTC/WebSocket, отдельные роли,
            шифрование и политики хранения биометрии.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
