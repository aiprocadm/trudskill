import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { ConfirmDialogFoundation, FormFoundation, RegistryFoundation } from '../../src/components/foundation';
import { PageContainer, PageHeader, SectionCard, SectionEmpty } from '../../src/components/state-wrappers';

const routeTitleMap: Record<string, string> = {
  users: 'Пользователи',
  courses: 'Курсы',
  groups: 'Группы',
  documents: 'Документы',
  settings: 'Настройки',
  audit: 'Аудит',
  registry: 'Registry placeholder',
  forms: 'Form placeholder',
  'module-empty': 'Protected empty module'
};

export default function ModulePage() {
  const route = 'documents';
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title={routeTitleMap[route]} />
        <SectionCard title="Foundation wrappers">
          {route === 'registry' ? <RegistryFoundation /> : null}
          {route === 'forms' ? <FormFoundation /> : null}
          {route === 'module-empty' ? <SectionEmpty message="Модуль еще не реализован" /> : null}
          {route !== 'registry' && route !== 'forms' && route !== 'module-empty' ? (
            <p>Раздел подключен в route-map и защищен guard-ами.</p>
          ) : null}
        </SectionCard>
        <SectionCard title="Notifications / Confirm placeholders">
          <p>Notifications placeholder</p>
          <ConfirmDialogFoundation />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
