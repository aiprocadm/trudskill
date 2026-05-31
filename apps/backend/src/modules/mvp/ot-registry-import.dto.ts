import { IsString } from 'class-validator';

export class ImportOtRegistryResponseDto {
  @IsString()
  fileBase64!: string;
}
