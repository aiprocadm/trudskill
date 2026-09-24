import { learnerRecipient } from './enrollment-recipient.js';

import type { EnrollmentCompletedPayload } from './enrollment-completed.event.js';
import type { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import type { Enrollment } from './mvp.types.js';

/**
 * Ревизия 2026-08-27 (порция 37, журнал 273) — сборка события «обучение завершено».
 *
 * Раньше она жила внутри перехода статуса зачисления, поэтому повторить её было неоткуда:
 * если событие потерялось вместе с перезапущенным процессом, выпуск документов уже никто
 * не начинал. Теперь это чистая функция от состояния центра — её зовут и переход статуса,
 * и часовой добор невыпущенного (`missed-issuance`), и оба собирают ОДНО И ТО ЖЕ событие,
 * а не две похожие версии, которые со временем разъедутся.
 */
export function buildEnrollmentCompletedPayload(
  state: InMemoryMvpState,
  tenantId: string,
  enrollment: Enrollment,
  options: { actorId?: string; requestId?: string; correlationId?: string } = {}
): EnrollmentCompletedPayload {
  const groupCourses = state.groupCourses.filter(
    (gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId
  );
  const documentSet = groupCourses
    .filter((gc) => gc.courseVersionId)
    .flatMap((gc) => {
      const courseVersionId = gc.courseVersionId as string;
      const version = state.courseVersions.find(
        (item) => item.tenantId === tenantId && item.id === courseVersionId
      );
      return state.courseDocumentSets
        .filter((entry) => entry.tenantId === tenantId && entry.courseVersionId === courseVersionId)
        .sort((a, b) => a.position - b.position)
        .map((entry) => ({
          courseVersionId,
          templateId: entry.templateId,
          position: entry.position,
          isRequired: entry.isRequired,
          autoIssueOnCompletion: entry.autoIssueOnCompletion,
          ...(entry.kindCode ? { kindCode: entry.kindCode } : {}),
          ...(version?.recertificationPeriodMonths
            ? { recertificationPeriodMonths: version.recertificationPeriodMonths }
            : {})
        }));
    });

  const recipient = learnerRecipient(
    state.learners.find((l) => l.tenantId === tenantId && l.id === enrollment.learnerId)
  );
  const courseTitle = resolveGroupCourseTitle(state, tenantId, enrollment.groupId);

  return {
    tenantId,
    enrollmentId: enrollment.id,
    learnerId: enrollment.learnerId,
    groupId: enrollment.groupId,
    groupCourseIds: groupCourses.map((gc) => gc.courseId),
    ...(options.actorId ? { actorId: options.actorId } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    documentSet,
    ...(recipient ? { recipient } : {}),
    ...(enrollment.completedAt ? { completedAt: enrollment.completedAt } : {}),
    ...(courseTitle ? { courseTitle } : {})
  };
}

/** Название программы для письма: сперва курс группы, иначе — имя самой группы. */
function resolveGroupCourseTitle(
  state: InMemoryMvpState,
  tenantId: string,
  groupId: string
): string | undefined {
  const groupCourse = state.groupCourses.find(
    (gc) => gc.tenantId === tenantId && gc.groupId === groupId
  );
  if (groupCourse) {
    const course = state.courses.find(
      (c) => c.tenantId === tenantId && c.id === groupCourse.courseId
    );
    if (course?.title) return course.title;
  }
  return state.groups.find((g) => g.tenantId === tenantId && g.id === groupId)?.name;
}
