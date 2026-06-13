import { ScormPackagesScreen } from '../../src/features/scorm/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ScormPage() {
  return (
    <ProtectedPage>
      <ScormPackagesScreen />
    </ProtectedPage>
  );
}
