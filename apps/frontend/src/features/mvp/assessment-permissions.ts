import { hasPermission } from '../../lib/rbac/permissions';

export const ASSESSMENT_READ_CROSS_LEARNER_PERMISSION = 'assessment.read.cross_learner';
export const LEARNERS_ACT_AS_PERMISSION = 'learners.act_as';

/** Кнопка «перейти к сведениям слушателя» в таблицах assessment (нет тихого расширения списков без этого права). */
export function showOpenLearnerRegistryAction(permissions: string[] | undefined): boolean {
  return hasPermission(permissions ?? [], ASSESSMENT_READ_CROSS_LEARNER_PERMISSION);
}

/** Действия «от лица слушателя» (делегирование): запуск попытки / сабмиты с их learnerId. */
export function showActAsLearnerAction(permissions: string[] | undefined): boolean {
  return hasPermission(permissions ?? [], LEARNERS_ACT_AS_PERMISSION);
}
