import { IsOptional, IsString } from 'class-validator';

export class CreateRostechnadzorExportDto {
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
}
