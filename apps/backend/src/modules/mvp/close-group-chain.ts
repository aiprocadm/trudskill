import type { ExamReadinessIssue } from './exam-readiness.js';
import type { Enrollment, ExamResult, Learner } from './mvp.types.js';

/**
 * ФТ-E3 (Фаза 5 Task 7): цепочка «экзамен → протокол → документы → строки реестра».
 *
 * Здесь — чистый отбор кандидатов без ввода-вывода: кто из зачислений группы доходит
 * до выпуска документов, а кто и ПОЧЕМУ отсеивается. Частичный успех — принцип цепочки:
 * слушатель без сданного экзамена не отменяет выпуск остальным, он попадает в отчёт.
 *
 * Блокирующие проблемы уровня группы (комиссия, программа) сюда не входят — протокол
 * один на всех, и без комиссии цепочки нет вовсе; их отсекает сервис до отбора.
 */

export interface ChainSkippedEnrollment {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  code: 'enrollment_not_completed' | 'exam_result_missing' | 'exam_not_passed' | 'learner_issue';
  message: string;
}

export interface ChainPartition {
  /** Зачисления, доходящие до протокола и удостоверений. */
  eligibleEnrollmentIds: string[];
  /** Отсеянные — поимённо и с причиной (частичный успех, а не «всё или ничего»). */
  skipped: ChainSkippedEnrollment[];
}

const fullNameOf = (learner: Learner | undefined): string =>
  learner
    ? [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(' ').trim()
    : '';

export function partitionChainCandidates(input: {
  enrollments: readonly Enrollment[];
  examResultsByEnrollmentId: ReadonlyMap<string, readonly ExamResult[]>;
  learnersById: ReadonlyMap<string, Learner>;
  /** Только `scope: 'learner'` из отчёта готовности; ключ соответствия — subjectId. */
  learnerIssues: readonly ExamReadinessIssue[];
}): ChainPartition {
  const issuesByLearnerId = new Map<string, ExamReadinessIssue>();
  for (const issue of input.learnerIssues) {
    if (issue.scope === 'learner' && issue.subjectId && !issuesByLearnerId.has(issue.subjectId)) {
      issuesByLearnerId.set(issue.subjectId, issue);
    }
  }

  const eligibleEnrollmentIds: string[] = [];
  const skipped: ChainSkippedEnrollment[] = [];

  for (const enrollment of input.enrollments) {
    const learner = input.learnersById.get(enrollment.learnerId);
    const base = {
      enrollmentId: enrollment.id,
      learnerId: enrollment.learnerId,
      fullName: fullNameOf(learner)
    };

    const learnerIssue = issuesByLearnerId.get(enrollment.learnerId);
    if (learnerIssue) {
      skipped.push({ ...base, code: 'learner_issue', message: learnerIssue.message });
      continue;
    }
    if (enrollment.status !== 'completed') {
      skipped.push({
        ...base,
        code: 'enrollment_not_completed',
        message: `Обучение не завершено (статус «${enrollment.status}») — документы выпускаются по завершённым зачислениям`
      });
      continue;
    }
    const results = input.examResultsByEnrollmentId.get(enrollment.id) ?? [];
    if (results.length === 0) {
      skipped.push({
        ...base,
        code: 'exam_result_missing',
        message: 'Нет результата проверки знаний — экзамен не проводился или не зафиксирован'
      });
      continue;
    }
    if (!results.some((r) => r.passed)) {
      skipped.push({
        ...base,
        code: 'exam_not_passed',
        message: 'Проверка знаний не сдана — удостоверение не выпускается'
      });
      continue;
    }
    eligibleEnrollmentIds.push(enrollment.id);
  }

  return { eligibleEnrollmentIds, skipped };
}
