import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf
} from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {}

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

export class SetUserRolesDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roleCodes!: string[];
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  email?: string | null;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;

  /** МГ-J3.2 (0112): должность сотрудника. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  position?: string | null;

  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: 'active' | 'blocked';
}

export class UpdateUserDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: 'active' | 'blocked';

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  position?: string | null;
}

/**
 * МГ-J3.2 (срез 8.11): «Пригласить сотрудника» — ФИО, почта, роли, должность.
 * Пароля нет: сотрудник входит по ссылке из письма (РМ72).
 */
export class InviteUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roleCodes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;
}
