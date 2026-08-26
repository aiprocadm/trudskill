import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

/**
 * Проверяемый вход чата (ревизия 2026-08-26, порция 14).
 *
 * Тела обеих ручек описывались литералом прямо в сигнатуре и не проверялись вовсе:
 * литерал при сборке исчезает, и общий проверяющий видит `Object` (разобрано в §5.359).
 * Можно было создать диалог с выдуманным типом и пустым списком участников или отправить
 * пустое сообщение — либо, наоборот, текст в мегабайт.
 */

const ID = /^[A-Za-z0-9_:-]{1,128}$/;

const DIALOG_TYPES = ['direct', 'entity_linked', 'support'] as const;

/**
 * Потолок участников. Групповая переписка в учебном центре — это преподаватель и группа;
 * сотня человек в одном диалоге означает ошибку, а не замысел.
 */
const MAX_PARTICIPANTS = 100;

export class CreateDialogDto {
  @IsIn(DIALOG_TYPES, { message: `type: ожидается одно из: ${DIALOG_TYPES.join(', ')}` })
  type!: (typeof DIALOG_TYPES)[number];

  @IsArray()
  @ArrayNotEmpty({ message: 'participantUserIds: нужен хотя бы один участник' })
  @ArrayMaxSize(MAX_PARTICIPANTS, {
    message: `participantUserIds: не больше ${MAX_PARTICIPANTS} участников`
  })
  @IsString({ each: true })
  @Matches(ID, { each: true, message: 'participantUserIds: недопустимый формат идентификатора' })
  participantUserIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'relatedEntityId: недопустимый формат' })
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  @Matches(ID, { message: 'assignedUserId: недопустимый формат' })
  assignedUserId?: string;
}

/**
 * Сообщение. Пустое отправлять незачем, а верхняя граница защищает не «производительность»,
 * а собеседника: простыня в мегабайт в переписке — это вставленный по ошибке файл.
 */
export class PostMessageDto {
  @IsString()
  @MinLength(1, { message: 'textBody: сообщение не может быть пустым' })
  @MaxLength(10000, { message: 'textBody: сообщение слишком длинное' })
  textBody!: string;
}
