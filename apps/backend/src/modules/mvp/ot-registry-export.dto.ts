import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateOtRegistryExportDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  enrolledFrom?: string;

  @IsOptional()
  @IsString()
  enrolledTo?: string;

  @IsOptional()
  @IsIn(['xlsx', 'xml'])
  format?: 'xlsx' | 'xml';
}
