import type { Course, CoursePayload, FrdoDocumentKind } from '../mvp/types';

/** Строка редактора именованных полей курса для документов. */
export interface ExtraFieldRow {
  key: string;
  label: string;
  value: string;
}

/** Состояние формы «Основное» курса (МГ-E2.1, срез 16.3) — всё строками, как в полях ввода. */
export interface CourseBasicsForm {
  code: string;
  title: string;
  description: string;
  directionId: string;
  presentationTitle: string;
  sortNo: string;
  price: string;
  responsibleUserId: string;
  note: string;
  periodDaysDefault: string;
  frdoDocumentKind: string;
  certificateNumberParts: [string, string, string];
  docExtraFields: ExtraFieldRow[];
}

export const EXTRA_KEY_FORMAT = /^[a-z][a-z0-9_]{0,39}$/;

export const toCourseBasicsForm = (course: Course): CourseBasicsForm => {
  const parts = course.certificateNumberParts ?? [];
  return {
    code: course.code,
    title: course.title,
    description: course.description ?? '',
    directionId: course.directionId ?? '',
    presentationTitle: course.presentationTitle ?? '',
    sortNo: course.sortNo === undefined ? '' : String(course.sortNo),
    price: course.price === undefined ? '' : String(course.price),
    responsibleUserId: course.responsibleUserId ?? '',
    note: course.note ?? '',
    periodDaysDefault:
      course.periodDaysDefault === undefined ? '' : String(course.periodDaysDefault),
    frdoDocumentKind: course.frdoDocumentKind ?? '',
    certificateNumberParts: [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''],
    docExtraFields: (course.docExtraFields ?? []).map((f) => ({ ...f }))
  };
};

const text = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Число из поля: пусто — очистить; «2 500,50» — 2500.5; не число — `undefined` (форма скажет). */
export const parseNumberField = (value: string): number | null | undefined => {
  const cleaned = value.replace(/\s+/g, '').replace(',', '.');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
};

/** Что не так в форме — по-человечески; `null` — можно сохранять. */
export const courseBasicsProblem = (form: CourseBasicsForm): string | null => {
  if (!form.code.trim() || !form.title.trim()) return 'Укажите код и название курса.';
  for (const [label, value] of [
    ['Порядок', form.sortNo],
    ['Цена', form.price],
    ['Срок обучения', form.periodDaysDefault]
  ] as const) {
    if (parseNumberField(value) === undefined) return `${label} — нужно число.`;
  }
  const keys = new Set<string>();
  for (const field of form.docExtraFields) {
    if (!EXTRA_KEY_FORMAT.test(field.key)) {
      return `Ключ поля «${field.label || field.key}» — латиница в нижнем регистре, цифры и «_», начинается с буквы.`;
    }
    if (keys.has(field.key)) return `Ключ «${field.key}» указан дважды.`;
    keys.add(field.key);
    if (!field.label.trim()) return `У поля «${field.key}» нет подписи.`;
  }
  return null;
};

/** Тело `PUT /courses/:id`: пустые поля — `null` (очистить), числа — числами. */
export const buildCoursePayload = (form: CourseBasicsForm): CoursePayload => {
  const parts = form.certificateNumberParts.map((part) => part.trim()).filter(Boolean);
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    directionId: form.directionId || null,
    presentationTitle: text(form.presentationTitle),
    sortNo: parseNumberField(form.sortNo) ?? null,
    price: parseNumberField(form.price) ?? null,
    responsibleUserId: form.responsibleUserId || null,
    note: text(form.note),
    periodDaysDefault: parseNumberField(form.periodDaysDefault) ?? null,
    frdoDocumentKind: form.frdoDocumentKind || null,
    certificateNumberParts: parts.length ? parts : null,
    docExtraFields: form.docExtraFields.length
      ? form.docExtraFields.map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          value: f.value.trim()
        }))
      : null
  };
};

const rub = (value: number): string =>
  `${value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;

/** «Основное» курса словами: только заполненное. */
export const courseBasicsRows = (
  course: Course,
  names: { direction?: string; responsible?: string; frdoKinds: readonly FrdoDocumentKind[] }
): Array<{ label: string; value: string }> => {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Код', value: course.code },
    { label: 'Направление', value: names.direction ?? 'не выбрано' }
  ];
  if (course.presentationTitle)
    rows.push({ label: 'Для документов', value: course.presentationTitle });
  if (course.periodDaysDefault !== undefined) {
    rows.push({ label: 'Срок обучения', value: `${course.periodDaysDefault} дн.` });
  }
  if (course.price !== undefined) rows.push({ label: 'Цена', value: rub(course.price) });
  if (course.frdoDocumentKind) {
    const kind = names.frdoKinds.find((k) => k.code === course.frdoDocumentKind);
    rows.push({
      label: 'Вид документа ФИС ФРДО',
      value: kind?.frdoKind ?? course.frdoDocumentKind
    });
  }
  if (course.certificateNumberParts?.length) {
    rows.push({ label: 'Номер удостоверения', value: course.certificateNumberParts.join(' · ') });
  }
  if (course.responsibleUserId) {
    rows.push({ label: 'Ответственный', value: names.responsible ?? 'сотрудник центра' });
  }
  if (course.sortNo !== undefined)
    rows.push({ label: 'Порядок в каталоге', value: String(course.sortNo) });
  for (const field of course.docExtraFields ?? []) {
    rows.push({ label: field.label, value: field.value || '—' });
  }
  if (course.note) rows.push({ label: 'Примечание', value: course.note });
  return rows;
};
