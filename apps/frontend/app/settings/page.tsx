import { ProfileCard } from '../../src/components/profile-card';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ThemeAppearanceSettings } from '../../src/components/theme-appearance-settings';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Настройки" subtitle="Ваш профиль и параметры интерфейса" />
        <ProfileCard />
        <SectionCard title="Внешний вид">
          <ThemeAppearanceSettings />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
