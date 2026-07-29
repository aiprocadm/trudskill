import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';

/**
 * Phase 2 Plan B — расширенный PATCH для учётки слушателя.
 * Симметрично `createLearnerExtended` из Plan A.
 * Не используется counterparties/directions — это специализированный DTO для learners.
 *
 * Семантика: все поля опциональны. Отсутствующее поле = «не трогать». null для опциональных
 * строк (email/snils/position/middleName/organizationUnitId/learnerNo) = «очистить».
 * `linkedIamUserId` подчиняется отдельному анти-IDOR правилу (см. `MvpService.updateLearnerExtended`).
 */
export class UpdateLearnerExtendedRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  middleName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(14) // XXX-XXX-XXX YY = 14 chars
  snils?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  position?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  organizationUnitId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  learnerNo?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(10) // ISO YYYY-MM-DD
  dateOfBirth?: string | null;

  /**
   * Фаза 3 Task 5 (ФТ-C1.3) — телефон для второго канала доставки. Формат НЕ валидируем
   * жёстко: в базу исторически грузили «8 (999) 123-45-67» и «+7 999 …», и отказать
   * оператору кадров в сохранении привычной записи хуже, чем принять её и нормализовать
   * перед отправкой (`normalizePhone` вернёт null на неотправляемое).
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'archived'])
  status?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  linkedIamUserId?: string | null;
}
