import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
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

/* ===========================================================================
 * Шаблоны, версии, переменные, привязки и правила нумерации (порция 13).
 *
 * Из этих записей рождается документ: шаблон задаёт бланк, переменные — что в него
 * подставится, правило нумерации — номер, под которым документ уйдёт в реестр. Мусор
 * здесь не «ломает экран», а попадает в бумагу, которую центр выдаёт человеку.
 * =========================================================================== */

const TEMPLATE_TYPES = [
  'certificate',
  'protocol',
  'order',
  'diploma',
  'attestation',
  'reference',
  'report',
  'contract'
] as const;

const VARIABLE_CATEGORIES = [
  'tenant',
  'group',
  'learner',
  'counterparty',
  'course',
  'commission',
  'document',
  'program',
  'enrollment',
  'group_learners'
] as const;

const RESET_PERIODS = ['none', 'year', 'month'] as const;

export class CreateTemplateDto {
  @IsString()
  @MinLength(2, { message: 'name: слишком короткое название бланка' })
  @MaxLength(200)
  name!: string;

  @IsIn(TEMPLATE_TYPES, {
    message: `templateType: ожидается одно из: ${TEMPLATE_TYPES.join(', ')}`
  })
  templateType!: (typeof TEMPLATE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'name: слишком короткое название бланка' })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'archived'], { message: 'status: ожидается active или archived' })
  status?: 'active' | 'archived';
}

export class CreateTemplateVersionDto {
  @IsString()
  @Matches(ID, { message: 'templateId: недопустимый формат' })
  templateId!: string;

  @IsString()
  @Matches(ID, { message: 'fileId: недопустимый формат' })
  fileId!: string;

  @IsOptional()
  @IsObject({ message: 'variablesSchema: ожидается объект' })
  variablesSchema?: Record<string, unknown>;
}

export class UpdateTemplateVersionDto {
  @IsOptional()
  @IsBoolean({ message: 'isActive: ожидается да/нет' })
  isActive?: boolean;

  @IsOptional()
  @IsObject({ message: 'variablesSchema: ожидается объект' })
  variablesSchema?: Record<string, unknown>;
}

/**
 * Код переменной подставляется в бланк как `{{code}}`. Пробелы и кириллица здесь не
 * работают: движок подстановки их не найдёт, и в документе останется сырой тег.
 */
const VARIABLE_CODE = /^[a-zA-Z][a-zA-Z0-9_.]{0,63}$/;

export class CreateTemplateVariableDto {
  @IsString()
  @Matches(ID, { message: 'templateVersionId: недопустимый формат' })
  templateVersionId!: string;

  @IsString()
  @Matches(VARIABLE_CODE, {
    message: 'variableCode: латиница, цифры, точка и подчёркивание; начинается с буквы'
  })
  variableCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  @IsIn(VARIABLE_CATEGORIES, {
    message: `categoryCode: ожидается одно из: ${VARIABLE_CATEGORIES.join(', ')}`
  })
  categoryCode!: (typeof VARIABLE_CATEGORIES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  dataType!: string;

  @IsOptional()
  @IsBoolean({ message: 'isRequired: ожидается да/нет' })
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateTemplateVariableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsIn(VARIABLE_CATEGORIES, {
    message: `categoryCode: ожидается одно из: ${VARIABLE_CATEGORIES.join(', ')}`
  })
  categoryCode?: (typeof VARIABLE_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  dataType?: string;

  @IsOptional()
  @IsBoolean({ message: 'isRequired: ожидается да/нет' })
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

const BIND_TYPES = ['direction', 'course', 'group'] as const;

export class CreateTemplateBindingDto {
  @IsString()
  @Matches(ID, { message: 'templateId: недопустимый формат' })
  templateId!: string;

  /* К чему привязан бланк: к направлению, курсу или конкретной группе. */
  @IsIn(BIND_TYPES, { message: `bindType: ожидается одно из: ${BIND_TYPES.join(', ')}` })
  bindType!: (typeof BIND_TYPES)[number];

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'directionId: недопустимый формат' })
  directionId?: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'courseId: недопустимый формат' })
  courseId?: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'groupId: недопустимый формат' })
  groupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  attachMode?: string;

  @IsOptional()
  @IsBoolean({ message: 'inheritToChildren: ожидается да/нет' })
  inheritToChildren?: boolean;

  /* Приоритет решает, какой бланк победит при нескольких привязках. */
  @IsOptional()
  @IsInt({ message: 'priority: ожидается целое число' })
  @Min(0)
  @Max(1000)
  priority?: number;
}

export class UpdateTemplateBindingDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  attachMode?: string;

  @IsOptional()
  @IsBoolean({ message: 'inheritToChildren: ожидается да/нет' })
  inheritToChildren?: boolean;

  @IsOptional()
  @IsInt({ message: 'priority: ожидается целое число' })
  @Min(0)
  @Max(1000)
  priority?: number;
}

export class GenerateDocumentsBatchDto {
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

  @IsArray()
  @ArrayNotEmpty({ message: 'sourceEntityIds: нужен хотя бы один объект' })
  @ArrayMaxSize(MAX_ENROLLMENTS, {
    message: `sourceEntityIds: не больше ${MAX_ENROLLMENTS} за один раз`
  })
  @IsString({ each: true })
  @Matches(ID, { each: true, message: 'sourceEntityIds: недопустимый формат идентификатора' })
  sourceEntityIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  documentType!: string;
}

/**
 * Правила нумерации. Номер документа — то, по чему его находят в реестре и в проверке,
 * поэтому шаблон номера и стартовый счётчик проверяются строго.
 *
 * `startCounter` только вперёд — откат назад повторно выдал бы уже использованные номера
 * (это записано в самом интерфейсе `UpdateNumberingRuleRequest`). Здесь проверяется лишь
 * форма: неотрицательное целое; «только вперёд» решает сервис, у него есть текущее значение.
 */
export class CreateNumberingRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  documentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  prefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  suffix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pattern?: string;

  @IsOptional()
  @IsIn(RESET_PERIODS, { message: `resetPeriod: ожидается одно из: ${RESET_PERIODS.join(', ')}` })
  resetPeriod?: (typeof RESET_PERIODS)[number];

  @IsOptional()
  @IsInt({ message: 'startCounter: ожидается целое число' })
  @Min(0, { message: 'startCounter: номер не бывает отрицательным' })
  startCounter?: number;
}

export class UpdateNumberingRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  prefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  suffix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pattern?: string;

  @IsOptional()
  @IsIn(RESET_PERIODS, { message: `resetPeriod: ожидается одно из: ${RESET_PERIODS.join(', ')}` })
  resetPeriod?: (typeof RESET_PERIODS)[number];

  @IsOptional()
  @IsInt({ message: 'startCounter: ожидается целое число' })
  @Min(0, { message: 'startCounter: номер не бывает отрицательным' })
  startCounter?: number;
}

/** Привязка загруженного файла к слоту подписи или печати. */
export class TenantImageSlotDto {
  /* `null` — намеренная форма «отвязать картинку», поэтому строка не обязательна. */
  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'fileId: недопустимый формат' })
  fileId?: string | null;

  /* Ширина в миллиметрах: печать шириной в метр — ошибка ввода, а не пожелание. */
  @IsOptional()
  @IsInt({ message: 'widthMm: ожидается целое число миллиметров' })
  @Min(1, { message: 'widthMm: ширина должна быть положительной' })
  @Max(200, { message: 'widthMm: слишком большая ширина для бланка' })
  widthMm?: number;
}

/* ===========================================================================
 * Остаток очереди (порция 14): загрузка файлов, установка текущей версии,
 * снятие задачи с карантина.
 * =========================================================================== */

/**
 * Запрос ссылки на загрузку. Размер и тип содержимого проверялись прямо в обработчике —
 * доменная часть (список разрешённых типов) там и остаётся, а форма переехала сюда, чтобы
 * правило «вход описан классом» действовало без исключений.
 *
 * Потолок в 50 МБ — общий предел для бланков и картинок центра: файл больше означает, что
 * человек грузит не то (скан в исходном разрешении вместо готовой печати).
 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export class CreateUploadUrlDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;

  @IsInt({ message: 'sizeBytes: ожидается целое число байт' })
  @Min(1, { message: 'sizeBytes: размер должен быть положительным' })
  @Max(MAX_UPLOAD_BYTES, { message: 'sizeBytes: файл слишком большой' })
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contentType?: string;
}

export class SetCurrentVersionDto {
  @IsString()
  @Matches(ID, { message: 'templateVersionId: недопустимый формат' })
  templateVersionId!: string;
}

/** Причина снятия задачи с карантина — попадает в журнал операций. */
export class DiscardQuarantinedDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
