import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateFrdoRegistryExportDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['certificate', 'diploma'], { each: true })
  types?: ('certificate' | 'diploma')[];

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}
