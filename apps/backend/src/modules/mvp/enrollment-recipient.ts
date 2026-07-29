import type { Learner } from './mvp.types.js';

export interface ResolvedRecipient {
  email: string;
  name: string;
  /**
   * Phase 10 Track C — IAM userId учащегося (`linkedIamUserId`), если профиль привязан к
   * аккаунту. Используется только для web-push фан-аута; email уходит независимо.
   */
  userId?: string;
  /**
   * Фаза 3 Task 5 (ФТ-C1.3) — телефон для второго канала (СМС). Как есть, без нормализации:
   * приводит к E.164 сам канал перед отправкой.
   */
  phone?: string;
}

/** Resolve a learner to an e-mail recipient, or undefined when no e-mail is on file. */
export function learnerRecipient(learner: Learner | undefined): ResolvedRecipient | undefined {
  if (!learner?.email) {
    return undefined;
  }
  const name = [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(' ');
  return {
    email: learner.email,
    name,
    ...(learner.linkedIamUserId ? { userId: learner.linkedIamUserId } : {}),
    ...(learner.phone ? { phone: learner.phone } : {})
  };
}
