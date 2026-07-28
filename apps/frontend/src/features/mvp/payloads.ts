import type {
  FinalAssessmentForm,
  LearnerCategory,
  ProgramMetaPatch,
  StudyForm,
  TrainingType
} from './types';

/** Local form state of the program-meta EDIT form (empty string / [] = "cleared"). */
export interface ProgramMetaFormState {
  academicHours: string;
  trainingType: TrainingType | '';
  learnerCategory: LearnerCategory | '';
  studyForm: StudyForm | '';
  finalAssessmentForm: FinalAssessmentForm | '';
  regulatoryBasisCodes: string[];
  commissionId: string;
  otProgramCodes: string[];
  /** Фаза 2 Task 6 (ФТ-B3.1): доля ролика для зачёта; пусто = умолчание 90%. */
  videoCompletionPercent: string;
  /** Фаза 2 Task 7 (ФТ-B3.2): запрет перемотки вперёд при первом просмотре. */
  noSeekOnFirstView: boolean;
  /** Фаза 2 Task 11 (ФТ-E1): строгий порядок прохождения модулей. */
  sequentialModules: boolean;
}

/**
 * Clear-vs-keep mapping for the program-meta EDIT form. The form pre-populates the
 * current values, so EVERY field is always sent: a real value updates, an explicit
 * clearing value (`null` for scalar/enum/FK, `[]` for arrays) unsets it. Omitting a
 * key would mean "keep" — which is exactly the bug this avoids.
 */
export function buildProgramMetaPatch(state: ProgramMetaFormState): ProgramMetaPatch {
  const hoursNum = Number(state.academicHours);
  return {
    academicHours:
      state.academicHours && Number.isFinite(hoursNum) && hoursNum > 0 ? hoursNum : null,
    trainingType: state.trainingType || null,
    learnerCategory: state.learnerCategory || null,
    studyForm: state.studyForm || null,
    finalAssessmentForm: state.finalAssessmentForm || null,
    regulatoryBasisCodes: state.regulatoryBasisCodes,
    commissionId: state.commissionId || null,
    otProgramCodes: state.otProgramCodes,
    videoCompletionPercent: normalizeCompletionPercent(state.videoCompletionPercent),
    // Флаг всегда булев: `null` тут означал бы «сбросить», а сбрасывать нечего —
    // выключенный запрет и есть значение по умолчанию.
    noSeekOnFirstView: state.noSeekOnFirstView,
    sequentialModules: state.sequentialModules
  };
}

/** Пустое поле или мусор → `null` (сервер применит умолчание 90%). */
function normalizeCompletionPercent(raw: string): number | null {
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < 1 || value > 100) return null;
  return Math.round(value);
}

/**
 * Clear-vs-keep mapping for the commission info EDIT form. Free-text `description`
 * is always sent (trimmed); an empty string clears it. Name is trimmed.
 */
export function buildCommissionInfoPayload(
  name: string,
  description: string
): { name: string; description: string } {
  return { name: name.trim(), description: description.trim() };
}
