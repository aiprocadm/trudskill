import type { EnrollmentWithDetails, NextStep } from './types';

const titleFor = (entry: EnrollmentWithDetails): string =>
  entry.course?.title ?? `Курс ${entry.enrollment.courseId}`;

const hasCourseId = (
  entry: EnrollmentWithDetails
): entry is EnrollmentWithDetails & { enrollment: { courseId: string } } =>
  typeof entry.enrollment.courseId === 'string' && entry.enrollment.courseId.length > 0;

export const pickNextStep = (entries: EnrollmentWithDetails[]): NextStep | null => {
  const eligible = entries.filter(hasCourseId);
  if (eligible.length === 0) return null;

  const continueCandidate = eligible.find(
    (entry) =>
      entry.enrollment.status === 'active' &&
      entry.progress.some((step) => step.status === 'in_progress')
  );
  if (continueCandidate) {
    const inProgress = continueCandidate.progress.find((step) => step.status === 'in_progress')!;
    return {
      kind: 'continue',
      courseId: continueCandidate.enrollment.courseId,
      courseTitle: titleFor(continueCandidate),
      moduleId: inProgress.moduleId,
      materialId: inProgress.materialId,
      href: `/learner/courses/${continueCandidate.enrollment.courseId}`,
      cta: 'Продолжить',
      headline: `Продолжите «${titleFor(continueCandidate)}»`,
      description: `Возобновите материал ${inProgress.materialId} в модуле ${inProgress.moduleId}.`
    };
  }

  const startCandidate = eligible.find(
    (entry) =>
      entry.enrollment.status === 'active' &&
      !entry.progress.some((step) => step.status === 'in_progress')
  );
  if (startCandidate) {
    return {
      kind: 'start',
      courseId: startCandidate.enrollment.courseId,
      courseTitle: titleFor(startCandidate),
      href: `/learner/courses/${startCandidate.enrollment.courseId}`,
      cta: 'Начать обучение',
      headline: `Начните «${titleFor(startCandidate)}»`,
      description: 'Курс назначен и доступен. Откройте, чтобы пройти первый материал.'
    };
  }

  const pendingCandidate = eligible.find(
    (entry) => entry.enrollment.status === 'pending' || entry.enrollment.status === 'suspended'
  );
  if (pendingCandidate) {
    return {
      kind: 'awaiting_assignment',
      courseId: pendingCandidate.enrollment.courseId,
      courseTitle: titleFor(pendingCandidate),
      href: `/learner/courses/${pendingCandidate.enrollment.courseId}`,
      cta: 'Открыть курс',
      headline: `Назначение «${titleFor(pendingCandidate)}» ожидает старта`,
      description: 'Куратор подтвердит доступ. Откройте курс — там появится подробная инструкция.'
    };
  }

  if (eligible.every((entry) => entry.enrollment.status === 'completed')) {
    return {
      kind: 'completed_all',
      href: '/learner/courses',
      cta: 'Открыть мои курсы',
      headline: 'Все курсы завершены — отлично!',
      description: 'Документы доступны в разделе «Мои курсы».'
    };
  }

  return null;
};
