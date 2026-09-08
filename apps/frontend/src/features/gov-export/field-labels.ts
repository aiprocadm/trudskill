/**
 * Имя поля выгрузки по-русски.
 *
 * Список отказов показывал сырое имя поля: «Иванов Иван: dateOfBirth — Дата рождения не
 * заполнена». Английское слово в строке, которую читает администратор учебного центра, — это
 * ровно то, что запрещено правилом «ни одного англицизма как значения». Само по себе оно ещё
 * и лишнее: сообщение и так называет поле. Но не всегда — «Дата должна быть в формате
 * ДД.ММ.ГГГГ» без подписи не говорит, КАКАЯ дата, а их в строке до трёх.
 *
 * Поле, которого нет в словаре, не выводится вовсе: показать «неизвестно» хуже, чем
 * показать одно сообщение.
 */
const FIELD_LABELS: Record<string, string> = {
  fullName: 'ФИО',
  snils: 'СНИЛС',
  dateOfBirth: 'Дата рождения',
  position: 'Должность',
  employerName: 'Работодатель',
  employerInn: 'ИНН работодателя',
  programName: 'Программа',
  programCode: 'Программа в реестре',
  protocolNumber: 'Номер протокола',
  registrationNumber: 'Регистрационный номер документа',
  documentNumber: 'Номер документа',
  documentKind: 'Вид документа',
  issueDate: 'Дата выдачи',
  completionDate: 'Дата окончания обучения',
  knowledgeCheckDate: 'Дата проверки знаний',
  attestationArea: 'Область аттестации',
  creditUnits: 'Зачётные единицы'
};

/** Строка отказа для человека: «Иванов Иван Иванович · Дата рождения: не заполнена…». */
export const describeRowError = (error: {
  field: string;
  message: string;
  fullName?: string;
}): string => {
  const who = error.fullName?.trim() || 'Строка без имени';
  const label = FIELD_LABELS[error.field];
  return label ? `${who} · ${label}: ${error.message}` : `${who}: ${error.message}`;
};

export const fieldLabel = (field: string): string | undefined => FIELD_LABELS[field];
