'use client';

import { PageContainer, PageHeader } from '../../../src/components/state-wrappers';
import { TenantUsageScreen } from '../../../src/features/usage/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

// ФТ-D4.2 (Фаза 4 Task 5): экран «Использование» — право tenant.usage.read (0076),
// у администрации центра; методист и слушатель сюда не попадают (routeMeta → /forbidden).
export default function TenantUsagePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Использование"
          subtitle="Тариф, счётчики и лимиты вашего учебного центра"
        />
        <TenantUsageScreen />
      </PageContainer>
    </ProtectedPage>
  );
}
