import { LearningCalendarScreen } from '../../../src/features/learning-calendar/calendar-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

/*
 * UI-021 / IA-001: экран переехал в features/learning-calendar/, стили styled-jsx —
 * в packages/ui/src/styles/calendar.ts (внутри styled-jsx их не видели сторожа токенов).
 */
export default function LearningCalendarPage() {
  return (
    <ProtectedPage>
      <LearningCalendarScreen />
    </ProtectedPage>
  );
}
