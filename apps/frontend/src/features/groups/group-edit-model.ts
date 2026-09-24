import type { Group, GroupPayload } from '../mvp/types';

/**
 * Модель дровера правки группы (ТЗ перехода §6.3 МГ-B4.1; срез 8.9, РМ68–РМ70).
 *
 * Форма — те же поля, что у шагов 1–2 мастера, без курсов (их назначение живёт в разделе
 * «Курсы группы», ручки удаления курса нет — РМ68). В запрос уходит только разница с исходной
 * формой (РМ69): закрытая группа принимает правку комментария, не получая 409 за неизменённый
 * код; очищенное поле уходит как `null` — «стереть», а не «не трогать».
 */
export interface GroupEditForm {
  name: string;
  code: string;
  counterpartyId: string;
  comment: string;
  learnerMessage: string;
  startDate: string;
  endDate: string;
  examDate: string;
  studyForm: string;
  isDot: '' | 'yes' | 'no';
}

export type GroupEditField = keyof GroupEditForm;

/** Зеркало серверного `GROUP_LOCKED_FIELDS`: у закрытой группы это не правится. */
export const GROUP_LOCKED_FIELDS: ReadonlyArray<GroupEditField> = [
  'code',
  'counterpartyId',
  'startDate',
  'endDate',
  'examDate'
];

export const GROUP_LOCKED_REASON =
  'Группа закрыта: даты, код и компанию менять нельзя. Название, комментарий, сообщение слушателям и форму обучения править можно.';

export const groupEditFormOf = (group: Group): GroupEditForm => ({
  name: group.name ?? '',
  code: group.code ?? '',
  counterpartyId: group.counterpartyId ?? '',
  comment: group.comment ?? '',
  learnerMessage: group.learnerMessage ?? '',
  startDate: group.startDate ?? '',
  endDate: group.endDate ?? '',
  examDate: group.examDate ?? '',
  studyForm: group.studyForm ?? '',
  isDot: group.isDot === undefined ? '' : group.isDot ? 'yes' : 'no'
});

/** Проверка формы до отправки: то же, что проверяет мастер (название, порядок дат). */
export const groupEditErrors = (form: GroupEditForm): Partial<Record<GroupEditField, string>> => {
  const errors: Partial<Record<GroupEditField, string>> = {};
  if (form.name.trim().length < 3) errors.name = 'Название: минимум 3 символа.';
  if (form.code.trim().length > 0 && form.code.trim().length < 2) {
    errors.code = 'Код группы: минимум 2 символа, или оставьте как есть.';
  }
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.endDate = 'Окончание обучения не может быть раньше начала.';
  }
  if (form.startDate && form.examDate && form.examDate < form.startDate) {
    errors.examDate = 'Дата экзамена не может быть раньше начала обучения.';
  }
  return errors;
};

const nullableText = (value: string): string | null => (value.trim() ? value.trim() : null);

/**
 * Разница «что изменилось» в форме тела `PUT /groups/:id`. Заблокированные поля
 * (`locked = true`) не уходят никогда — даже если форма их несёт: сервер ответил бы 409 на всю
 * правку, а человек хотел лишь поправить комментарий.
 */
export const groupEditDiff = (
  initial: GroupEditForm,
  form: GroupEditForm,
  locked: boolean
): GroupPayload => {
  const payload: GroupPayload = {};
  const changed = (field: GroupEditField): boolean =>
    form[field].trim() !== initial[field].trim() &&
    !(locked && GROUP_LOCKED_FIELDS.includes(field));
  if (changed('name')) payload.name = form.name.trim();
  if (changed('code') && form.code.trim()) payload.code = form.code.trim();
  if (changed('counterpartyId')) payload.counterpartyId = form.counterpartyId || null;
  if (changed('comment')) payload.comment = nullableText(form.comment);
  if (changed('learnerMessage')) payload.learnerMessage = nullableText(form.learnerMessage);
  if (changed('startDate')) payload.startDate = form.startDate || null;
  if (changed('endDate')) payload.endDate = form.endDate || null;
  if (changed('examDate')) payload.examDate = form.examDate || null;
  if (changed('studyForm') && form.studyForm) payload.studyForm = form.studyForm;
  if (changed('isDot') && form.isDot) payload.isDot = form.isDot === 'yes';
  return payload;
};
