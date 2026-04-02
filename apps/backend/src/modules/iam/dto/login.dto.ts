import type { RefreshRequestContract } from '@cdoprof/api-contracts';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
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

export class RefreshDto implements RefreshRequestContract {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

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
}
