import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Phase 3 Plan A — POST /tests/:id/questions. Добавление вопроса в тест.
 * sortOrder опционален: сервис кладёт в конец, если не передан.
 */
export class AddTestQuestionRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  questionId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * Phase 3 Plan A — PATCH /tests/:id/questions/:questionId. Перенумерация.
 */
export class ReorderTestQuestionRequest {
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
