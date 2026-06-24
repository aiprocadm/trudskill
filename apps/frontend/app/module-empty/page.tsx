import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty
} from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ModulePage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Раздел в разработке" subtitle="Этот раздел защищён и появится позже" />
        <SectionCard title="Скоро">
          <SectionEmpty message="Раздел ещё не реализован" />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
