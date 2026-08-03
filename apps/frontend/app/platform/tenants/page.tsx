'use client';

import { PageContainer, PageHeader } from '../../../src/components/state-wrappers';
import { PlatformTenantsSection } from '../../../src/features/platform-tenants/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

// ФТ-D2.2 (Фаза 4 Task 3, срез 3): платформенная админка тенантов. Право
// platform.tenants.read есть только у platform_admin (0073) — обычный админ
// центра сюда не попадает (routeMeta → /forbidden).
export default function PlatformTenantsPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Арендаторы платформы"
          subtitle="Жизненный цикл учебных центров и вход «от имени» для поддержки"
        />
        <PlatformTenantsSection />
      </PageContainer>
    </ProtectedPage>
  );
}
