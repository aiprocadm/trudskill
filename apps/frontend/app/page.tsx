import { ProtectedPage } from '../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard, SectionEmpty } from '../src/components/state-wrappers';

export default function DashboardPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Dashboard" />
        <SectionCard title="Добро пожаловать">
          <SectionEmpty message="Dashboard placeholder для будущих виджетов" />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
