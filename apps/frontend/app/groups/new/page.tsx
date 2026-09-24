import { GroupWizardScreen } from '../../../src/features/groups/group-wizard/group-wizard-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

/** `?copyOf=<id>` — мастер с предзаполнением из существующей группы (МГ-B6.1). */
export default async function GroupCreatePage({
  searchParams
}: {
  searchParams: Promise<{ copyOf?: string }>;
}) {
  const { copyOf } = await searchParams;
  return (
    <ProtectedPage>
      <GroupWizardScreen {...(copyOf ? { copyOf } : {})} />
    </ProtectedPage>
  );
}
