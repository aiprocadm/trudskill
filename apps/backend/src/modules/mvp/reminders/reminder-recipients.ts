import { learnerRecipient } from '../enrollment-recipient.js';

import type { DispatchRecipient } from '../../communication/notification-dispatcher.service.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { Enrollment } from '../mvp.types.js';

/** First course-version id linked to the enrollment's group (mirrors 5B's scan). */
export function resolveCourseVersionIdForGroup(
  state: InMemoryMvpState,
  tenantId: string,
  groupId: string
): string | undefined {
  return state.groupCourses.find(
    (gc) => gc.tenantId === tenantId && gc.groupId === groupId && gc.courseVersionId
  )?.courseVersionId;
}

/** Course title for a course-version id (version → course → title). */
export function resolveCourseTitleByVersion(
  state: InMemoryMvpState,
  tenantId: string,
  courseVersionId: string
): string | undefined {
  const cv = state.courseVersions.find((v) => v.tenantId === tenantId && v.id === courseVersionId);
  const course = cv && state.courses.find((c) => c.tenantId === tenantId && c.id === cv.courseId);
  return course ? course.title : undefined;
}

/** Employer contact e-mail via the group's linked counterparty. */
export function resolveEmployerEmail(
  state: InMemoryMvpState,
  tenantId: string,
  groupId: string
): string | undefined {
  const group = state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
  if (!group?.counterpartyId) return undefined;
  return state.counterparties.find((c) => c.tenantId === tenantId && c.id === group.counterpartyId)
    ?.contactEmail;
}

/** Display name (ФИО) + СНИЛС for a learner id, for read-models (graceful empty when absent). */
export function resolveLearnerDisplay(
  state: InMemoryMvpState,
  tenantId: string,
  learnerId: string
): { name: string; snils?: string } {
  const learner = state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
  if (!learner) return { name: '' };
  const name = [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(' ');
  return { name, ...(learner.snils ? { snils: learner.snils } : {}) };
}

/**
 * Phase 5C-2 — настроенные сотрудники тенанта (admin/curator) как получатели staff-копии.
 * Источник — MVP-снимок (`notificationStaffRecipients`), доступный и в HTTP-запросе, и в
 * ночном cron через `MvpTenantRunner` (без coupling к IAM). Пусто по умолчанию (opt-in).
 */
export function buildStaffRecipients(
  state: InMemoryMvpState,
  tenantId: string
): DispatchRecipient[] {
  return (state.notificationStaffRecipients ?? [])
    .filter((r) => r.tenantId === tenantId)
    .map((r) => ({ email: r.email, kind: 'admin' as const }));
}

/** Learner (+ employer when present) recipients for an enrollment. */
export function buildLearnerEmployerRecipients(
  state: InMemoryMvpState,
  tenantId: string,
  enrollment: Enrollment
): DispatchRecipient[] {
  const recipients: DispatchRecipient[] = [];
  const learner = state.learners.find(
    (l) => l.tenantId === tenantId && l.id === enrollment.learnerId
  );
  const rcpt = learnerRecipient(learner);
  if (rcpt) {
    // Phase 10 Track C — forward the learner's IAM userId (when linked) so the dispatcher can
    // fan out a web-push alongside the email. Employer recipients have no userId (push skipped).
    recipients.push({
      email: rcpt.email,
      name: rcpt.name,
      kind: 'learner',
      ...(rcpt.userId ? { userId: rcpt.userId } : {})
    });
  }
  const employerEmail = resolveEmployerEmail(state, tenantId, enrollment.groupId);
  if (employerEmail) {
    recipients.push({ email: employerEmail, kind: 'employer' });
  }
  return recipients;
}
