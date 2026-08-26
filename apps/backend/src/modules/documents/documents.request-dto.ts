import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

/**
 * Проверяемые тела запросов на ВЫПУСК документов (ревизия 2026-08-26).
 *
 * Почему это понадобилось. Тела этих ручек были типизированы интерфейсами
 * (`GenerateDocumentRequest`, `CloseGroupRequest`, …). Интерфейс при сборке исчезает:
 * в метаданных остаётся `Object`, а общий проверяющий (`ValidationPipe`) типы `Object`
 * ПРОПУСКАЕТ. Проверено не рассуждением, а на собранном коде — `dist/.../documents.
 * controller.js` содержит `__metadata("design:paramtypes", [Object, Object])`, тогда как
 * ручки входа с классами-DTO дают `[Object, LoginDto, …]`.
 *
 * То есть в эти ручки можно было прислать что угодно: число вместо названия, `null`
 * вместо идентификатора, тысячу зачислений одним вызовом. Дальше мусор уходил в домен —
 * и либо падал ошибкой сервера вместо понятного ответа, либо оседал в документе, который
 * центр выдаёт человеку и который имеет юридическую силу.
 *
 * Классы объявлены отдельно от интерфейсов, а не вместо них: интерфейсы описывают
 * ДОГОВОР сервиса и используются внутри, классы — ВХОД снаружи. Свести их в одно значило
 * бы тянуть class-validator в слой домена.
 */

/** Идентификаторы в продукте выглядят как `tpl_a3f9…` — пустая строка и пробелы не годятся. */
const ID = /^[A-Za-z0-9_:-]{1,128}$/;

export class GenerateDocumentDto {
  @IsString()
  @Matches(ID, { message: 'idempotencyKey: недопустимый формат' })
  idempotencyKey!: string;

  @IsString()
  @Matches(ID, { message: 'templateId: недопустимый формат' })
  templateId!: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'templateVersionId: недопустимый формат' })
  templateVersionId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceEntityType!: string;

  @IsString()
  @Matches(ID, { message: 'sourceEntityId: недопустимый формат' })
  sourceEntityId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  documentType!: string;

  /** Дата в документе — только `ГГГГ-ММ-ДД`: её печатают, а не разбирают. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validUntil: ожидается дата в формате ГГГГ-ММ-ДД' })
  validUntil?: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'groupId: недопустимый формат' })
  groupId?: string;
}

/**
 * Потолок в 500 записей — не про производительность, а про честность отказа: пачку
 * больше этого центр всё равно делит на части, и лучше сказать об этом сразу, чем
 * принять запрос и уронить очередь.
 */
const MAX_ENROLLMENTS = 500;

export class CloseGroupDto {
  @IsString()
  @Matches(ID, { message: 'groupId: недопустимый формат' })
  groupId!: string;

  @IsString()
  @Matches(ID, { message: 'protocolTemplateId: недопустимый формат' })
  protocolTemplateId!: string;

  @IsString()
  @Matches(ID, { message: 'certificateTemplateId: недопустимый формат' })
  certificateTemplateId!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'enrollmentIds: нужен хотя бы один слушатель' })
  @ArrayMaxSize(MAX_ENROLLMENTS, {
    message: `enrollmentIds: не больше ${MAX_ENROLLMENTS} записей за один раз`
  })
  @IsString({ each: true })
  @Matches(ID, { each: true, message: 'enrollmentIds: недопустимый формат идентификатора' })
  enrollmentIds!: string[];
}

export class IssueGroupOrderDto {
  @IsString()
  @Matches(ID, { message: 'groupId: недопустимый формат' })
  groupId!: string;

  @IsString()
  @Matches(ID, { message: 'templateId: недопустимый формат' })
  templateId!: string;

  /*
   * Пустой список здесь ЗАКОНЕН, в отличие от закрытия группы: приказ выпускают и без
   * каскада удостоверений (`certificateTemplateId` тоже необязателен). Первая версия
   * поставила сюда «не пустой» по аналогии с соседним классом — и уронила сторожевой тест
   * идемпотентности, который выпускает приказ ровно так. Проверка не должна ужесточать
   * домен: её дело — не пускать мусор, а не запрещать разрешённое.
   */
  @IsArray()
  @ArrayMaxSize(MAX_ENROLLMENTS, {
    message: `enrollmentIds: не больше ${MAX_ENROLLMENTS} записей за один раз`
  })
  @IsString({ each: true })
  @Matches(ID, { each: true, message: 'enrollmentIds: недопустимый формат идентификатора' })
  enrollmentIds!: string[];

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'certificateTemplateId: недопустимый формат' })
  certificateTemplateId?: string;
}

/**
 * Причина отзыва и перевыпуска. Она попадает в журнал и в объяснение человеку, поэтому
 * пустая строка и «...» тут не годятся: отзыв документа объясняют словами.
 */
export class DocumentReasonDto {
  @IsString()
  @MinLength(3, { message: 'reason: объясните причину словами — минимум 3 символа' })
  @MaxLength(500)
  reason!: string;
}
