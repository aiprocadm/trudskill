import type { AnswerOption, AttemptAnswer, Question } from './mvp.types.js';

/**
 * Phase 3 Plan B: pure-function autograder.
 *
 * Binary V1 grading (no partial credit). Reusable by Plan C reviewer flow.
 * `autoGraded: false` means the question cannot be machine-scored and needs a
 * human reviewer (essay) OR is misconfigured (no correct option / no reference
 * value); callers treat the 0 as provisional.
 */
export interface AutogradeInput {
  question: Question;
  options: AnswerOption[];
  answer: AttemptAnswer | undefined;
}

export interface AutogradeResult {
  score: number;
  autoGraded: boolean;
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function gradeChoice(input: AutogradeInput): AutogradeResult {
  const { question, options, answer } = input;
  const correct = options
    .filter((o) => o.isCorrect)
    .map((o) => o.id)
    .sort();
  if (correct.length === 0) return { score: 0, autoGraded: false };
  const selected = [...(answer?.selectedOptionIds ?? answer?.answerOptionIds ?? [])].sort();
  const matched = JSON.stringify(correct) === JSON.stringify(selected);
  return { score: matched ? question.score : 0, autoGraded: true };
}

function gradeNumber(input: AutogradeInput): AutogradeResult {
  const { question, answer } = input;
  if (question.numericExpected === undefined || question.numericExpected === null) {
    return { score: 0, autoGraded: false };
  }
  const raw = answer?.textAnswer?.trim();
  const value = raw === undefined || raw === '' ? Number.NaN : Number(raw);
  if (Number.isNaN(value)) return { score: 0, autoGraded: true };
  const tolerance = question.numericTolerance ?? 0;
  const matched = Math.abs(value - question.numericExpected) <= tolerance;
  return { score: matched ? question.score : 0, autoGraded: true };
}

function gradeText(input: AutogradeInput): AutogradeResult {
  const { question, answer } = input;
  if (!question.expectedAnswer) return { score: 0, autoGraded: false };
  const given = answer?.textAnswer ?? '';
  const matched = normalizeText(given) === normalizeText(question.expectedAnswer);
  return { score: matched ? question.score : 0, autoGraded: true };
}

export function gradeAnswer(input: AutogradeInput): AutogradeResult {
  switch (input.question.type) {
    case 'single_choice':
    case 'multiple_choice':
      return gradeChoice(input);
    case 'number_input':
      return gradeNumber(input);
    case 'text':
      return gradeText(input);
    case 'essay':
    default:
      return { score: 0, autoGraded: false };
  }
}
