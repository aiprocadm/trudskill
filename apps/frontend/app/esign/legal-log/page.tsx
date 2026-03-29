import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard } from '../../../src/components/state-wrappers';

export default function EsignLegalLogPage() {
  return (
    <ProtectedPage requiredPermissions={['esign.legal.read']}>
      <PageContainer>
        <PageHeader title="Legal log" subtitle="Append-only реестр юридически значимых событий" />
        <SectionCard title="Фильтры расследования">
          <ul>
            <li>entity_type/entity_id</li>
            <li>actor</li>
            <li>event_type</li>
            <li>date range</li>
          </ul>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
