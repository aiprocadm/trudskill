import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Проверяемый вход операций дозаполнения (ревизия 2026-08-26, порция 14).
 *
 * Ручки закрыты общим секретом и работают поверх всех центров сразу, но тело до сих пор
 * описывалось литералом и не проверялось: `domain` мог быть любой строкой, а размер пачки —
 * нулём или миллионом. Первое ушло бы в сервис и упало где-то в глубине, второе способно
 * занять базу на часы.
 */

const DOMAINS = ['lms', 'documents'] as const;

/** Пачка: меньше 1 бессмысленно, больше 10 000 — способ надолго занять базу одной командой. */
const MIN_BATCH = 1;
const MAX_BATCH = 10_000;

export class CreateBackfillRunDto {
  @IsIn(DOMAINS, { message: `domain: ожидается одно из: ${DOMAINS.join(', ')}` })
  domain!: (typeof DOMAINS)[number];

  @IsOptional()
  @IsInt({ message: 'batchSize: ожидается целое число' })
  @Min(MIN_BATCH, { message: `batchSize: не меньше ${MIN_BATCH}` })
  @Max(MAX_BATCH, { message: `batchSize: не больше ${MAX_BATCH}` })
  batchSize?: number;
}

export class CreateAndRunBackfillDto extends CreateBackfillRunDto {
  /** Сколько пачек прогнать за один вызов — тот же смысл, что у размера пачки. */
  @IsOptional()
  @IsInt({ message: 'maxBatches: ожидается целое число' })
  @Min(1, { message: 'maxBatches: не меньше 1' })
  @Max(1000, { message: 'maxBatches: не больше 1000' })
  maxBatches?: number;
}
