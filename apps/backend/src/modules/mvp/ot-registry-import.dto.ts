import { IsString, MaxLength } from 'class-validator';

export class ImportOtRegistryResponseDto {
  // Defense-in-depth: cap the base64 payload (~15 MB binary at 20 MB encoded)
  // to avoid unbounded memory on decode.
  @IsString()
  @MaxLength(20_000_000)
  fileBase64!: string;
}
