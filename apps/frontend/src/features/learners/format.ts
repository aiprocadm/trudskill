import type {
  LearnerAccessOutcome,
  LearnerEditFormState,
  LearnerListItem,
  LearnerStatus,
  UpdateLearnerProfilePayload
} from './types';

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

/** Пустая форма — исходное для заведения и для тестов; поля личного дела — пустые строки. */
export const EMPTY_LEARNER_FORM: LearnerEditFormState = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  snils: '',
  dateOfBirth: '',
  position: '',
  organizationUnitId: '',
  learnerNo: '',
  status: 'active',
  phone: '',
  gender: '',
  citizenship: '',
  birthPlace: '',
  registrationAddress: '',
  educationLevel: '',
  passportSeries: '',
  passportNumber: '',
  passportIssuedAt: '',
  passportIssuedBy: '',
  diplomaSeries: '',
  diplomaNumber: '',
  diplomaInstitution: '',
  diplomaSurname: '',
  trackingNumber: '',
  deliveryMethod: '',
  counterpartyId: '',
  extraFields: {}
};

/** Строки формы из карточки; маски сервера (`***-***-*** 95`, `**.**.1990`) остаются как есть — их не отправляют. */
export function toEditFormState(learner: LearnerListItem): LearnerEditFormState {
  const passport = typeof learner.passport === 'object' ? learner.passport : undefined;
  return {
    firstName: learner.firstName,
    lastName: learner.lastName,
    middleName: learner.middleName ?? '',
    email: learner.email ?? '',
    snils: learner.snils ?? '',
    dateOfBirth: learner.dateOfBirth ?? '',
    position: learner.position ?? '',
    organizationUnitId: learner.organizationUnitId ?? '',
    learnerNo: learner.learnerNo ?? '',
    status: learner.status,
    phone: learner.phone ?? '',
    gender: learner.gender ?? '',
    citizenship: learner.citizenship ?? '',
    birthPlace: learner.birthPlace ?? '',
    registrationAddress: learner.registrationAddress ?? '',
    educationLevel: learner.educationLevel ?? '',
    passportSeries: passport?.series ?? '',
    passportNumber: passport?.number ?? '',
    passportIssuedAt: passport?.issuedAt ?? '',
    passportIssuedBy: passport?.issuedBy ?? '',
    diplomaSeries: learner.diploma?.series ?? '',
    diplomaNumber: learner.diploma?.number ?? '',
    diplomaInstitution: learner.diploma?.institution ?? '',
    diplomaSurname: learner.diploma?.surnameInDiploma ?? '',
    trackingNumber: learner.trackingNumber ?? '',
    deliveryMethod: learner.deliveryMethod ?? '',
    counterpartyId: learner.counterpartyId ?? '',
    extraFields: Object.fromEntries(
      Object.entries(learner.extraFields ?? {}).map(([key, value]: [string, unknown]) => [
        key,
        typeof value === 'string' ? value : value == null ? '' : String(value)
      ])
    )
  };
}

/** Текстовые поля формы — всё, кроме объекта именованных полей. */
type LearnerTextField = Exclude<keyof LearnerEditFormState, 'extraFields'>;

/** Маска сервера в поле — значит, человек его не менял; такое в запрос не уходит. */
const isMasked = (value: string): boolean => value.includes('*');

/**
 * Разница «что изменилось» в форме `UpdateLearnerProfilePayload`: уходят только изменённые
 * поля (МГ-C1.1, срез 8.12b) — иначе маскированный СНИЛС или дата рождения из карточки
 * вернулись бы на сервер и легли поверх настоящих значений. Пустая строка — `null` (очистить).
 */
export function buildUpdatePayload(
  form: LearnerEditFormState,
  initial: LearnerEditFormState = form
): UpdateLearnerProfilePayload {
  const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);
  const changed = (key: LearnerTextField): boolean =>
    initial === form || form[key].trim() !== initial[key].trim();
  const payload: UpdateLearnerProfilePayload = {};
  if (changed('firstName')) payload.firstName = form.firstName.trim();
  if (changed('lastName')) payload.lastName = form.lastName.trim();
  if (changed('middleName')) payload.middleName = nullable(form.middleName);
  if (changed('email')) payload.email = nullable(form.email);
  if (changed('snils') && !isMasked(form.snils)) payload.snils = nullable(form.snils);
  if (changed('dateOfBirth') && !isMasked(form.dateOfBirth))
    payload.dateOfBirth = nullable(form.dateOfBirth);
  if (changed('position')) payload.position = nullable(form.position);
  if (changed('organizationUnitId')) payload.organizationUnitId = nullable(form.organizationUnitId);
  if (changed('learnerNo')) payload.learnerNo = nullable(form.learnerNo);
  if (changed('status')) payload.status = form.status;
  if (changed('phone')) payload.phone = nullable(form.phone);
  if (changed('gender')) payload.gender = form.gender || null;
  if (changed('citizenship')) payload.citizenship = nullable(form.citizenship);
  if (changed('birthPlace')) payload.birthPlace = nullable(form.birthPlace);
  if (changed('registrationAddress'))
    payload.registrationAddress = nullable(form.registrationAddress);
  if (changed('educationLevel')) payload.educationLevel = nullable(form.educationLevel);
  if (changed('trackingNumber')) payload.trackingNumber = nullable(form.trackingNumber);
  if (changed('deliveryMethod')) payload.deliveryMethod = nullable(form.deliveryMethod);
  if (changed('counterpartyId')) payload.counterpartyId = form.counterpartyId || null;
  const passportTouched = (
    ['passportSeries', 'passportNumber', 'passportIssuedAt', 'passportIssuedBy'] as const
  ).some(changed);
  if (passportTouched) {
    const series = form.passportSeries.trim();
    const number = form.passportNumber.trim();
    payload.passport =
      series || number
        ? {
            series,
            number,
            ...(form.passportIssuedAt.trim() ? { issuedAt: form.passportIssuedAt.trim() } : {}),
            ...(form.passportIssuedBy.trim() ? { issuedBy: form.passportIssuedBy.trim() } : {})
          }
        : null;
  }
  const diplomaTouched = (
    ['diplomaSeries', 'diplomaNumber', 'diplomaInstitution', 'diplomaSurname'] as const
  ).some(changed);
  if (diplomaTouched) {
    const diploma = {
      ...(form.diplomaSeries.trim() ? { series: form.diplomaSeries.trim() } : {}),
      ...(form.diplomaNumber.trim() ? { number: form.diplomaNumber.trim() } : {}),
      ...(form.diplomaInstitution.trim() ? { institution: form.diplomaInstitution.trim() } : {}),
      ...(form.diplomaSurname.trim() ? { surnameInDiploma: form.diplomaSurname.trim() } : {})
    };
    payload.diploma = Object.keys(diploma).length ? diploma : null;
  }
  /*
   * Именованные поля (МГ-C1.3, РМ87): уходят только изменённые ключи — сервер сливает их с
   * текущими, пустая строка удаляет ключ. Так ключи переноса CDOPROF не стираются правкой.
   */
  const extraKeys = new Set([
    ...Object.keys(form.extraFields),
    ...Object.keys(initial.extraFields)
  ]);
  const extraChanged = [...extraKeys].filter((key) =>
    initial === form
      ? (form.extraFields[key] ?? '').trim() !== ''
      : (form.extraFields[key] ?? '').trim() !== (initial.extraFields[key] ?? '').trim()
  );
  if (extraChanged.length > 0) {
    payload.extraFields = Object.fromEntries(
      extraChanged.map((key) => [key, (form.extraFields[key] ?? '').trim()])
    );
  }
  return payload;
}

/** Паспорт заполнен наполовину — сервер откажет; лучше сказать до отправки (Э8). */
export function passportFormHint(form: LearnerEditFormState): string | undefined {
  const series = form.passportSeries.trim();
  const number = form.passportNumber.trim();
  if ((series && !number) || (!series && number)) {
    return 'Паспорт: укажите и серию, и номер — или оставьте оба поля пустыми.';
  }
  return undefined;
}

/**
 * Что сказать человеку после «Выслать доступ» (МГ-C2.1, срез 9.3) — тремя исходами, как у
 * приглашения сотрудника: письмо ушло / предел запросов / почта стенда выключена.
 */
export function accessOutcomeText(
  outcome: LearnerAccessOutcome,
  email: string | undefined
): string {
  const opened = outcome.linked ? ' Вход в кабинет открыт.' : '';
  switch (outcome.status) {
    case 'sent':
      return `Письмо со ссылкой для входа отправлено на ${email ?? 'почту слушателя'} — ссылка действует 15 минут.${opened}`;
    case 'throttled':
      return `Письмо не ушло: слишком много запросов ссылки на этот адрес. Повторить можно через 15 минут.${opened}`;
    case 'logged':
      return `Почта на этом стенде выключена — ссылка для входа записана в журнал сервера.${opened}`;
    default:
      return `Доступ выслан.${opened}`;
  }
}
