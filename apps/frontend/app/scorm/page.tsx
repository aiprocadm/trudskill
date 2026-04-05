import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';

export default function ScormPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="SCORM и внешние тренажёры" subtitle="П. 5.23 ТЗ — каталог, запуск из ЛК, передача результата в аттестацию" />
        <SectionCard title="Статус">
          <p style={{ margin: 0, color: '#52525b', lineHeight: 1.55 }}>
            Тип материала <code>external_url</code> в MVP закладывает запуск внешних объектов; полноценный SCORM API (cmi5/xAPI) — в бэклоге.
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
