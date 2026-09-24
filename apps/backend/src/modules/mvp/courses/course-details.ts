import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';

import type { CourseDetails } from './course-details.types.js';

export type { CourseDetails } from './course-details.types.js';

const notNull = (_: unknown, value: unknown): boolean => value !== null;

/** Ключ именованного поля курса для документов: `{course.extra.<ключ>}`. */
export const COURSE_EXTRA_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Именованное поле курса для документов (МГ-E2.1): «Присвоена квалификация», «Разряд» и т. п. */
export class CourseExtraFieldDto {
  @Matches(COURSE_EXTRA_KEY, {
    message: 'Ключ поля — латиница в нижнем регистре, цифры и «_», начинается с буквы'
  })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @IsString()
  @MaxLength(2000)
  value!: string;
}

/**
 * МГ-E2.1 (срез 16.1): поля курса из карточки CDOPROF — общая часть тел создания и правки.
 * Нет поля — не трогать; `null` — очистить.
 */
export class CourseDetailsRequest {
  /** «Представление» — наименование программы для документов (длиннее названия в каталоге). */
  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  presentationTitle?: string | null;

  /** Номер по порядку в каталоге («пп» CDOPROF). */
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortNo?: number | null;

  /** Цена, ₽ — для заявок и портала. */
  @IsOptional()
  @ValidateIf(notNull)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  price?: number | null;

  /** Ответственный методист — сотрудник центра. */
  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(64)
  responsibleUserId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  /** Срок обучения по умолчанию, дней: подставляется в курс группы, если срок не задан. */
  @IsOptional()
  @ValidateIf(notNull)
  @IsInt()
  @Min(1)
  @Max(3650)
  periodDaysDefault?: number | null;

  /** Вид документа ФИС ФРДО по курсу: код из справочника (`PK`, `PP`). */
  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(20)
  frdoDocumentKind?: string | null;

  /** Номер удостоверения — до трёх частей, как в CDOPROF («14», «ОТ», «2026»). */
  @IsOptional()
  @ValidateIf(notNull)
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  certificateNumberParts?: string[] | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CourseExtraFieldDto)
  docExtraFields?: CourseExtraFieldDto[] | null;
}

/** Поля курса, которые переносятся из тела как есть (`null` — очистить). */
export const COURSE_DETAIL_FIELDS = [
  'presentationTitle',
  'sortNo',
  'price',
  'responsibleUserId',
  'note',
  'periodDaysDefault',
  'frdoDocumentKind',
  'certificateNumberParts',
  'docExtraFields'
] as const;

export type CourseDetailField = (typeof COURSE_DETAIL_FIELDS)[number];

/** Переносит поля курса: строки обрезаются, пустое — очищает; части номера — без пустых. */
export function applyCourseDetails(
  target: CourseDetails,
  patch: Partial<Record<CourseDetailField, unknown>>
): void {
  for (const field of COURSE_DETAIL_FIELDS) {
    const raw = patch[field];
    if (raw === undefined) continue;
    if (raw === null) {
      delete target[field];
      continue;
    }
    if (typeof raw === 'string') {
      const value = raw.trim();
      if (value) (target as Record<string, unknown>)[field] = value;
      else delete target[field];
      continue;
    }
    if (field === 'certificateNumberParts') {
      const parts = (raw as string[]).map((part) => part.trim()).filter(Boolean);
      if (parts.length) target.certificateNumberParts = parts;
      else delete target.certificateNumberParts;
      continue;
    }
    if (field === 'docExtraFields') {
      const fields = (raw as Array<{ key: string; label: string; value: string }>).map((f) => ({
        key: f.key,
        label: f.label.trim(),
        value: f.value.trim()
      }));
      if (fields.length) target.docExtraFields = fields;
      else delete target.docExtraFields;
      continue;
    }
    (target as Record<string, unknown>)[field] = raw;
  }
}
