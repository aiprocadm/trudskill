'use client';

import { PageContainer, PageHeader } from '../../src/components/state-wrappers';
import { OnboardingScreen } from '../../src/features/onboarding/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

// ФТ-D2.3 (Фаза 4 Task 7): мастер онбординга учебного центра. Право — администрации центра
// (`tenant.settings.write`, как у реквизитов; журнал 343 — под `tenant.read` ход настройки
// видел и слушатель); каждый шаг записывается своим правом.
export default function OnboardingPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Настройка центра"
          subtitle="Шесть шагов до первой группы: реквизиты, лицензия, бренд, комиссия, шаблоны, курс"
        />
        <OnboardingScreen />
      </PageContainer>
    </ProtectedPage>
  );
}
