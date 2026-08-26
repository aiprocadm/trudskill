import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Вход переобработки неудачных вебхуков (ревизия 2026-08-26, порция 14).
 *
 * Раньше код поставщика выдёргивался из тела как есть — `@Body('providerCode')` отдаёт
 * что прислали, включая объект или число, и это уходило прямо в отбор записей.
 */
export class ReprocessFailedDto {
  /** Не задан — переобрабатываются неудачные вызовы всех поставщиков. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/, {
    message: 'providerCode: латиница в нижнем регистре, цифры, дефис и подчёркивание'
  })
  providerCode?: string;
}
