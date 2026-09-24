import { IsString, MaxLength, MinLength } from 'class-validator';

/** Шаг 2 загрузки файла личного дела: прикрепить уже загруженный файл (срез 9.2). */
export class AttachLearnerFileRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  fileId!: string;
}
