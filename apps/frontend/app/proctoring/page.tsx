import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

export default function ProctoringPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Прокторинг" subtitle="П. 5.16 ТЗ — проверка оборудования, сессия, протокол, интеграция с внешним сервисом" />
        <SectionCard title="Статус">
          <p style={{ margin: 0, color: '#52525b', lineHeight: 1.55 }}>
            Контур проктора и хранение медиа не подключены. План: WebRTC/WebSocket, отдельные роли, шифрование и политики хранения биометрии.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
