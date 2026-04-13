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
          <p style={{ margin: 0, color: '#52525b', lineHeight: 1.55 }}>
            Тип материала <code>external_url</code> в MVP закладывает запуск внешних объектов;
            полноценный SCORM API (cmi5/xAPI) — в бэклоге.
          </p>
        </SectionCard>
        <SectionCard title="План внедрения (эпик)">
          <ol style={{ margin: 0, paddingLeft: 20, color: '#3f3f46', lineHeight: 1.65 }}>
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
