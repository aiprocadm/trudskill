import type { CommitScormAttemptPayload, ScormAttemptDto, ScormLessonStatus } from './types';

/** SCORM 1.2 CMITimespan 'HHHH:MM:SS.SS' -> integer seconds; garbage -> 0. */
export function parseScormSessionTime(value: string): number {
  const m = /^(\d{2,4}):(\d{2}):(\d{2})(?:\.\d{1,2})?$/.exec(value ?? '');
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** cmi snapshot from scorm-again -> commit payload; empty fields omitted (exactOptionalPropertyTypes). */
export function buildCommitPayload(cmi: {
  core?: {
    lesson_status?: string;
    lesson_location?: string;
    session_time?: string;
    score?: { raw?: string | number; max?: string | number; min?: string | number };
  };
  suspend_data?: string;
}): CommitScormAttemptPayload {
  const num = (v: string | number | undefined): number | undefined => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const score = cmi.core?.score;
  const raw = num(score?.raw);
  const max = num(score?.max);
  const min = num(score?.min);
  return {
    ...(cmi.core?.lesson_status
      ? { lessonStatus: cmi.core.lesson_status as ScormLessonStatus }
      : {}),
    ...(cmi.core?.lesson_location ? { lessonLocation: cmi.core.lesson_location } : {}),
    ...(cmi.suspend_data ? { suspendData: cmi.suspend_data } : {}),
    ...(raw !== undefined ? { scoreRaw: raw } : {}),
    ...(max !== undefined ? { scoreMax: max } : {}),
    ...(min !== undefined ? { scoreMin: min } : {}),
    sessionSeconds: parseScormSessionTime(cmi.core?.session_time ?? '')
  };
}

/** Restore cmi for repeated launch (resume D7). */
export function buildInitialCmi(
  attempt: ScormAttemptDto,
  learner: { studentId: string; studentName: string }
): Record<string, unknown> {
  return {
    core: {
      student_id: learner.studentId,
      student_name: learner.studentName,
      ...(attempt.lessonLocation ? { lesson_location: attempt.lessonLocation } : {}),
      lesson_status: attempt.lessonStatus,
      ...(attempt.scoreRaw !== undefined ? { score: { raw: attempt.scoreRaw } } : {})
    },
    ...(attempt.suspendData ? { suspend_data: attempt.suspendData } : {})
  };
}
