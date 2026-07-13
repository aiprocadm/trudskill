import { UiKitGalleryScreen } from '../../../src/features/ui-kit/gallery-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function UiKitPage() {
  return (
    <ProtectedPage>
      <UiKitGalleryScreen />
    </ProtectedPage>
  );
}
