import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Паспорт (МГ-C1.1, РМ76): серия и номер обязательны внутри объекта, формат не жёсткий (иностранные паспорта). */
export class LearnerPassportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  series!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  number!: string;

  @IsOptional()
  @Matches(DATE_RE, { message: 'дата выдачи — в формате ГГГГ-ММ-ДД' })
  issuedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  issuedBy?: string;
}

export class LearnerDiplomaDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  surnameInDiploma?: string;
}

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

  /* ---- Личное дело (ТЗ перехода §4, МГ-C1.1): null — очистить поле. ---- */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => LearnerPassportDto)
  passport?: LearnerPassportDto | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['m', 'f'])
  gender?: 'm' | 'f' | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  birthPlace?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  citizenship?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  registrationAddress?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  educationLevel?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => LearnerDiplomaDto)
  diploma?: LearnerDiplomaDto | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  trackingNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  deliveryMethod?: string | null;

  /** Значения именованных полей центра (C1.3): объект «ключ → строка», сливается по ключам — пустая строка удаляет ключ (РМ87). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  extraFields?: Record<string, string> | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  counterpartyId?: string | null;
}
