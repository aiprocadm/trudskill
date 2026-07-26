export const IDENTITY_VERIFICATION_REJECTED_EVENT =
  'learning.identity_verification_rejected' as const;

/**
 * Фаза 0 Task 4 (ФТ-F1): слушатель в CommunicationModule уведомляет слушателя
 * об отклонении проверки личности (раньше — log-only stub в MvpService).
 */
export interface IdentityVerificationRejectedPayload {
  tenantId: string;
  verificationId: string;
  learnerId: string;
  /** reviewedAt участвует в dedup-ключе: повторный reject после resubmit — новое письмо. */
  reviewedAt: string;
  reason?: string;
  /** Resolved learner contact; absent if the learner has no e-mail on file. */
  recipient?: { email: string; name?: string; userId?: string };
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}
