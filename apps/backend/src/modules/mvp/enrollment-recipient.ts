import type { Learner } from './mvp.types.js';

export interface ResolvedRecipient {
  email: string;
  name: string;
}

/** Resolve a learner to an e-mail recipient, or undefined when no e-mail is on file. */
export function learnerRecipient(learner: Learner | undefined): ResolvedRecipient | undefined {
  if (!learner?.email) {
    return undefined;
  }
  return { email: learner.email, name: `${learner.lastName} ${learner.firstName}`.trim() };
}
