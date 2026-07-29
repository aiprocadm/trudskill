export const PRE_EXAM_AUTH_REQUESTED_EVENT = 'assessment.pre_exam_auth_requested' as const;

/**
 * Фаза 0 Task 4 (ФТ-F1): слушатель в CommunicationModule шлёт письмо со ссылкой
 * подтверждения личности перед экзаменом. `verifyUrl` содержит живой одноразовый
 * токен — payload живёт только in-process и не должен попадать в аудит/логи целиком.
 */
export interface PreExamAuthRequestedPayload {
  tenantId: string;
  tokenId: string;
  enrollmentId: string;
  testId: string;
  learnerId: string;
  verifyUrl: string;
  expiresAt: string;
  /**
   * Resolved learner contact; absent if the learner has no e-mail on file.
   *
   * Фаза 3 Task 5 (ФТ-C1.3): `phone` — второй канал доставки той же ссылки. Он именно
   * ДОПОЛНИТЕЛЬНЫЙ: слушатель без email не получает ни письма, ни СМС (так было и раньше),
   * потому что весь контакт разрешается через email-получателя.
   */
  recipient?: { email: string; name?: string; userId?: string; phone?: string };
  courseTitle?: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}
