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
    otProgramCodes: state.otProgramCodes
  };
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
