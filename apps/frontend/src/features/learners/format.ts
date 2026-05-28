import type { LearnerEditFormState, LearnerListItem, LearnerStatus } from './types';

export function formatFullName(
  learner: Pick<LearnerListItem, 'lastName' | 'firstName' | 'middleName'>
): string {
  return [learner.lastName, learner.firstName, learner.middleName ?? '']
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

export const STATUS_LABEL: Record<LearnerStatus, string> = {
  active: 'Активен',
  archived: 'В архиве'
};

/** Маска СНИЛС: «123-456-789 01» -> отображение как есть, но безопасно при отсутствии. */
export function formatSnils(snils: string | undefined): string {
  if (!snils) return '—';
  const digits = snils.replace(/\D/g, '');
  if (digits.length !== 11) return snils;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9, 11)}`;
}

/** Утилита для `editFormState -> UpdateLearnerProfilePayload` с null для пустых строк. */
export function buildUpdatePayload(form: LearnerEditFormState) {
  const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);
  const required = (v: string): string => v.trim();
  return {
    firstName: required(form.firstName),
    lastName: required(form.lastName),
    middleName: nullable(form.middleName),
    email: nullable(form.email),
    snils: nullable(form.snils),
    position: nullable(form.position),
    organizationUnitId: nullable(form.organizationUnitId),
    learnerNo: nullable(form.learnerNo),
    status: form.status
  };
}
