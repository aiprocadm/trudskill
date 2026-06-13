import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

/** `POST /scorm-packages` — регистрация после presigned PUT zip-файла. */
export class RegisterScormPackageRequest {
  @IsString()
  @MinLength(1)
  zipFileId!: string;

  /** Необязательный заголовок; иначе возьмём <title> организации из манифеста при process. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

/** `POST /scorm-materials/:materialId/launch` */
export class LaunchScormMaterialRequest {
  @IsString()
  @MinLength(1)
  enrollmentId!: string;
}

export const SCORM_LESSON_STATUSES = [
  'not attempted',
  'incomplete',
  'completed',
  'passed',
  'failed',
  'browsed'
] as const;

/** `PUT /scorm-attempts/:id/commit` — снапшот cmi-полей от плеера. Все поля опциональны (merge). */
export class CommitScormAttemptRequest {
  @IsOptional()
  @IsIn([...SCORM_LESSON_STATUSES])
  lessonStatus?: (typeof SCORM_LESSON_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lessonLocation?: string;

  /** SCORM 1.2 ограничивает 4096; берём с запасом 64KB (некоторые пакеты нарушают стандарт). */
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  suspendData?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreRaw?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreMin?: number;

  /** Секунды cmi.core.session_time этого коммита; суммируются в totalSeconds. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sessionSeconds?: number;
}
