/**
 * Схемы ответов API CDOPROF v1 (Фаза 0 перехода, МГ-K1.1).
 *
 * Источник — `docs/audit/cdoprof-openapi-v1.yaml`. Это описание ТЕСТОВОГО сервера, живой может
 * отличаться, поэтому схемы намеренно мягкие (решение РМ17):
 *
 *   • каждое поле сущности — `nullable().optional()`: OpenAPI объявляет их `nullable`, а живой
 *     API может поле и не прислать;
 *   • `.passthrough()` — неизвестная колонка не ошибка, а предмет аудита: выгрузка Фазы 0 как
 *     раз должна её увидеть (профиль колонок в манифесте);
 *   • `items` и `trainings` в `contragent.students.trainings` описаны как ОБЪЕКТ, хотя по смыслу
 *     это списки — принимаем обе формы и нормализуем в массив.
 *
 * Строгая схема уронила бы выгрузку из-за одной лишней колонки — ровно то, чего аудит источника
 * позволить себе не может.
 */
import { z } from 'zod';

const text = z.string().nullable().optional();
const integer = z.number().int().nullable().optional();

export const cdoprofPaginationSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    pages: z.number().int(),
    has_prev: z.boolean().optional(),
    has_next: z.boolean().optional()
  })
  .passthrough();

export const cdoprofContragentSchema = z
  .object({
    id: z.number().int(),
    inn: text,
    name_organiztion: text,
    short_name: text,
    post: text,
    city: text,
    addres: text,
    yur_addres: text,
    fact_addres: text,
    okpo: text,
    okato: text,
    oktmo: text,
    okogu: text,
    okopf: text,
    okvd: text,
    ogrn: text,
    kpp: text,
    email: text,
    fio_directora: text,
    director_position: text
  })
  .passthrough();

export const cdoprofStudentSchema = z
  .object({
    id: z.number().int(),
    id_organiz: integer,
    login: text,
    email: text,
    phone: text,
    full_name: text,
    surname: text,
    name: text,
    otchestvo: text,
    data_rozdeniya: text,
    sex: text,
    dolznost: text,
    created_at: text
  })
  .passthrough();

export const cdoprofParentCourseSchema = z
  .object({
    id: z.number().int(),
    name_course: text
  })
  .passthrough();

export const cdoprofCourseSchema = z
  .object({
    id: z.number().int(),
    id_parent_course: integer,
    cod: text,
    name_course: text,
    count_hour: integer,
    hours_theory: integer,
    hours_practice: integer,
    period_obuch: integer,
    date_add: text,
    price: integer,
    note: text
  })
  .passthrough();

export const cdoprofGroupSchema = z
  .object({
    id: z.number().int(),
    name_group: text,
    date_create: text,
    date_on: text,
    date_off: text,
    access_material: text,
    date_exam_start: text,
    date_exam_end: text,
    date_practice_on: text,
    date_practice_off: text
  })
  .passthrough();

export const cdoprofResultSchema = z
  .object({
    code: integer,
    result: text,
    result_rus: text
  })
  .passthrough();

export type CdoprofPagination = z.infer<typeof cdoprofPaginationSchema>;
export type CdoprofContragent = z.infer<typeof cdoprofContragentSchema>;
export type CdoprofStudent = z.infer<typeof cdoprofStudentSchema>;
export type CdoprofParentCourse = z.infer<typeof cdoprofParentCourseSchema>;
export type CdoprofCourse = z.infer<typeof cdoprofCourseSchema>;
export type CdoprofGroup = z.infer<typeof cdoprofGroupSchema>;
export type CdoprofResult = z.infer<typeof cdoprofResultSchema>;

/** Конверт постраничного списка: `{ success, data: { items, pagination } }`. */
export const cdoprofListEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    success: z.boolean().optional(),
    data: z.object({
      items: z.array(item),
      pagination: cdoprofPaginationSchema
    })
  });

export interface CdoprofListPage<T> {
  items: T[];
  pagination: CdoprofPagination;
}

const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

const cdoprofTrainingSchema = z
  .object({
    course: cdoprofCourseSchema.partial().nullable().optional(),
    group: cdoprofGroupSchema.partial().nullable().optional(),
    result: cdoprofResultSchema.nullable().optional()
  })
  .passthrough();

const cdoprofTrainingItemSchema = z
  .object({
    student: cdoprofStudentSchema.partial().nullable().optional(),
    trainings: z
      .union([z.array(cdoprofTrainingSchema), cdoprofTrainingSchema])
      .nullable()
      .optional()
      .transform((value) => (value ? toArray(value) : []))
  })
  .passthrough();

/** Конверт `contragent.students.trainings` — с нормализацией объектов в массивы. */
export const cdoprofTrainingsEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    contragent: cdoprofContragentSchema.partial().nullable().optional(),
    items: z
      .union([z.array(cdoprofTrainingItemSchema), cdoprofTrainingItemSchema])
      .nullable()
      .optional()
      .transform((value) => (value ? toArray(value) : [])),
    pagination: cdoprofPaginationSchema.partial().nullable().optional()
  })
});

export type CdoprofTraining = z.infer<typeof cdoprofTrainingSchema>;
export type CdoprofTrainingItem = z.output<typeof cdoprofTrainingItemSchema>;
export type CdoprofTrainingsResponse = z.output<typeof cdoprofTrainingsEnvelopeSchema>['data'];
