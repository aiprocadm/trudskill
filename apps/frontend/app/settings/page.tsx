import { ProfileCard } from '../../src/components/profile-card';
import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ThemeAppearanceSettings } from '../../src/components/theme-appearance-settings';
import { TwoFactorCard } from '../../src/features/auth/two-factor-card';
import { BrandingSettingsSection } from '../../src/features/branding/branding-section';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Настройки" subtitle="Ваш профиль и параметры интерфейса" />
        <ProfileCard />
        <SectionCard title="Безопасность">
          <TwoFactorCard />
        </SectionCard>
        <SectionCard title="Внешний вид">
          <ThemeAppearanceSettings />
        </SectionCard>
        {/* ФТ-D3.1: секция (с карточкой) сама скрывается без права tenant.branding.configure */}
        <BrandingSettingsSection />
      </PageContainer>
    </ProtectedPage>
  );
}
