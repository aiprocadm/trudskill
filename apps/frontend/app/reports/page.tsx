import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ReportsPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Отчётность" subtitle="П. 5.24 ТЗ — выгрузки по курсам, группам, экзаменам, НЭП, прокторингу" />
        <SectionCard title="Статус">
          <p style={{ margin: 0, color: '#52525b', lineHeight: 1.55 }}>
            Модуль отчётов и журнал формирования в очереди разработки. Временно используйте разделы <strong>Экспорты</strong>, <strong>Аудит</strong> и доменные списки (группы, слушатели, assessment).
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
