'use client';

import { PageContainer, PageHeader } from '../../src/components/state-wrappers';
import { PlatformLibraryScreen } from '../../src/features/library/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

// ФТ-D6 (Фаза 4 Task 10): каталог курсов платформы. Читать может любой сотрудник
// с courses.read; копирование — courses.write; наполнение каталога — library.publish.
export default function PlatformLibraryPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Библиотека курсов"
          subtitle="Готовые программы платформы — скопируйте нужную в свой центр"
        />
        <PlatformLibraryScreen />
      </PageContainer>
    </ProtectedPage>
  );
}
