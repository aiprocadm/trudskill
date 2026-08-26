import {
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
 * Проверяемый вход раздела электронной подписи (ревизия 2026-08-26, порция 12).
 *
 * Двенадцать ручек подписания принимали тело без единой проверки: их типы объявлены
 * интерфейсами в `@trudskill/shared-types`, а интерфейс при сборке исчезает — в метаданных
 * остаётся `Object`, и общий проверяющий такой тип пропускает (разобрано в §5.359).
 *
 * Здесь это опаснее, чем в среднем по продукту. Подписание — то, на чём держится
 * доказательная сила документа: порядок подписантов, тип участника, ключ повторной
 * отправки. Мусор в этих полях не «ломает экран», а делает юридический след
 * недостоверным — и обнаруживается это тогда, когда на след ссылаются в споре.
 *
 * Интерфейсы из общего пакета НЕ трогаем: они описывают договор между приложениями и
 * правятся только через `packages/api-contracts`. Классы здесь — отдельный слой входа,
 * ровно как в документах (`documents.request-dto.ts`).
 */

/** Идентификаторы в продукте: `esa_a3f9…`, `usr_71c…`. */
const ID = /^[A-Za-z0-9_:-]{1,128}$/;

/** Ключ повторной отправки приходит от клиента и может быть длиннее обычного идентификатора. */
const IDEMPOTENCY = /^[A-Za-z0-9_:.-]{1,200}$/;

/** Дата и время — ISO, как во всём продукте. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export class CreateEsignApplicationDto {
  @IsString()
  @Matches(ID, { message: 'learnerId: недопустимый формат' })
  learnerId!: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_TIME, { message: 'expiresAt: ожидается дата в формате ISO' })
  expiresAt?: string;
}

export class UpdateEsignApplicationDto {
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_TIME, { message: 'expiresAt: ожидается дата в формате ISO' })
  expiresAt?: string;
}

/**
 * Причина отказа. Её читает человек, которому отказали, — поэтому пустая строка и «-»
 * не годятся: отказ в подписании объясняют словами.
 */
export class EsignReasonDto {
  @IsString()
  @MinLength(3, { message: 'reason: объясните причину словами — минимум 3 символа' })
  @MaxLength(500)
  reason!: string;
}

export class CreateEsignApplicationFileDto {
  @IsString()
  @Matches(ID, { message: 'applicationId: недопустимый формат' })
  applicationId!: string;

  @IsString()
  @Matches(ID, { message: 'fileId: недопустимый формат' })
  fileId!: string;
}

export class CreateSigningProcessDto {
  @IsString()
  @Matches(IDEMPOTENCY, { message: 'idempotencyKey: недопустимый формат' })
  idempotencyKey!: string;

  @IsString()
  @Matches(ID, { message: 'generatedDocumentId: недопустимый формат' })
  generatedDocumentId!: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'applicationId: недопустимый формат' })
  applicationId?: string;

  @IsOptional()
  sequential?: boolean;

  /**
   * Снимок документа на момент подписания. Содержимое намеренно не разбираем — это
   * произвольные данные конкретного шаблона; проверяем только, что это объект, а не строка
   * и не массив: иначе снимок ляжет в юридический след в неразбираемом виде.
   */
  @IsOptional()
  @IsObject({ message: 'snapshot: ожидается объект' })
  snapshot?: Record<string, unknown>;
}

export class StartSigningProcessDto {
  @IsString()
  @Matches(IDEMPOTENCY, { message: 'idempotencyKey: недопустимый формат' })
  idempotencyKey!: string;
}

const PARTICIPANT_TYPES = ['learner', 'commission_member', 'employee'] as const;

export class CreateSigningParticipantDto {
  @IsString()
  @Matches(ID, { message: 'processId: недопустимый формат' })
  processId!: string;

  /*
   * Тип участника берётся из общего типа `SigningParticipantType`, а не выдумывается:
   * от него зависит, что подписывает человек и как это трактуется потом.
   */
  @IsIn(PARTICIPANT_TYPES, {
    message: `participantType: ожидается одно из: ${PARTICIPANT_TYPES.join(', ')}`
  })
  participantType!: (typeof PARTICIPANT_TYPES)[number];

  @IsString()
  @Matches(ID, { message: 'participantUserId: недопустимый формат' })
  participantUserId!: string;

  /*
   * Порядок подписания — целое от 1 до 100. Ноль и отрицательные значения ломают
   * последовательный режим (кто подписывает первым), а трёхзначный порядок означает
   * ошибку ввода: сотни подписантов на одном документе не бывает.
   */
  @IsInt({ message: 'signOrder: ожидается целое число' })
  @Min(1, { message: 'signOrder: нумерация начинается с 1' })
  @Max(100, { message: 'signOrder: слишком большой порядковый номер' })
  signOrder!: number;
}

export class UpdateSigningParticipantDto {
  @IsOptional()
  @IsInt({ message: 'signOrder: ожидается целое число' })
  @Min(1, { message: 'signOrder: нумерация начинается с 1' })
  @Max(100, { message: 'signOrder: слишком большой порядковый номер' })
  signOrder?: number;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_TIME, { message: 'expiresAt: ожидается дата в формате ISO' })
  expiresAt?: string;
}

/** Подписать, отказаться, пропустить — у всех трёх одна форма. */
export class ParticipantActionDto {
  @IsString()
  @Matches(IDEMPOTENCY, { message: 'idempotencyKey: недопустимый формат' })
  idempotencyKey!: string;

  @IsOptional()
  @IsObject({ message: 'payload: ожидается объект' })
  payload?: Record<string, unknown>;
}
