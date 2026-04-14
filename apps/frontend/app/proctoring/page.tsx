import { FeatureComingSoon } from '../../src/components/feature-coming-soon';
import { PageContainer, PageHeader } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ProctoringPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Прокторинг"
          subtitle="П. 5.16 ТЗ — проверка оборудования, сессия, протокол, интеграция с внешним сервисом"
        />
        <FeatureComingSoon
          progress={25}
          eta="Спринт 3"
          roles={['proctor', 'admin', 'methodist']}
          availableNow={[
            'Assessment-блок и назначение тестов',
            'Курсы/группы/зачисления',
            'Audit trail базового уровня'
          ]}
          links={[
            { href: '/assessment', label: 'Открыть Assessment' },
            { href: '/groups', label: 'Открыть Группы' },
            { href: '/audit', label: 'Открыть Аудит' }
          ]}
        />
      </PageContainer>
    </ProtectedPage>
  );
}
