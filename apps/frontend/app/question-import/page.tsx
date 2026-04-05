import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';

export default function QuestionImportPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Импорт вопросов" subtitle="П. 5.7 ТЗ — файл, валидация, протокол ошибок" />
        <SectionCard title="API">
          <p style={{ margin: '0 0 12px', color: '#52525b', lineHeight: 1.55 }}>
            Бэкенд: <code>POST /questions/import</code> с телом JSON <code>items: CreateQuestionRequest[]</code> (массовое создание). Расширение: загрузка файла, парсер шаблона и отчёт об ошибках.
          </p>
          <TzLinks items={[{ href: '/assessment', label: 'Assessment — банки и вопросы' }]} />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
