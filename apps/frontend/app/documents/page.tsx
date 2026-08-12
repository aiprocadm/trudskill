import { DocumentsScreen } from '../../src/features/documents/documents-screen';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

/*
 * ТЗ §8.2: page.tsx ≤20 строк, экран живёт в features/documents/ — там его видит
 * расширенный сторож единых состояний (IA-001).
 */
export default function DocumentsPage() {
  return (
    <ProtectedPage>
      <DocumentsScreen />
    </ProtectedPage>
  );
}
