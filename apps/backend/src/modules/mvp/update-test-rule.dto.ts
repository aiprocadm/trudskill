import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Phase 3 Plan A — PUT /tests/:id/rules. Upsert правил теста.
 *
 * Все поля optional на уровне DTO: партиальный upsert, сервис мерджит с существующими.
 * Валидация: attemptLimit >= 1, questionCount > 0 || null, timeLimitMinutes > 0 || null,
 * passingScore >= 0.
 */
export class UpdateTestRuleRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  attemptLimit?: number;

  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  questionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;

  @IsOptional()
  @IsBoolean()
  dailyResetEnabled?: boolean;
}
