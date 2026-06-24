import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function QuestionImportPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Импорт вопросов"
          subtitle="Импорт вопросов из файла с валидацией и протоколом ошибок"
        />
        <SectionCard title="Импорт из файла">
          <p className="ui-prose-muted ui-prose-muted--tight">
            Массовый импорт вопросов из файла появится здесь. Пока вопросы можно создавать вручную в
            банках вопросов.
          </p>
          <TzLinks items={[{ href: '/assessment', label: 'Перейти к банкам вопросов и тестам' }]} />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
