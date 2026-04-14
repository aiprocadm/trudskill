import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ScormPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="SCORM и внешние тренажёры"
          subtitle="П. 5.23 ТЗ — каталог, запуск из ЛК, передача результата в аттестацию"
        />
        <SectionCard title="Текущее состояние">
          <p className="ui-prose-muted">
            Тип материала <code>external_url</code> в MVP закладывает запуск внешних объектов;
            полноценный SCORM API (cmi5/xAPI) — в бэклоге.
          </p>
        </SectionCard>
        <SectionCard title="План внедрения (эпик)">
          <ol className="ui-ordered-list">
            <li>Загрузка пакета (manifest, ресурсы) в object storage и метаданные в БД.</li>
            <li>Изолированный iframe / launch URL с политикой CSP.</li>
            <li>Мост cmi5 или xAPI LRS для событий завершения и баллов.</li>
            <li>Связь результата с зачислением и экзаменом (правила зачёта).</li>
            <li>Прокторинг и ограничения для итоговой аттестации при необходимости.</li>
          </ol>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
