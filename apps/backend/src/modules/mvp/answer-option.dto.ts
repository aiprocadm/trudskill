import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  type ValidationOptions,
  registerDecorator
} from 'class-validator';

/**
 * Phase 3 Plan A — вложенный/standalone PATCH вариант answer option.
 * Используется в `CreateQuestionRequest.answerOptions` для single_choice/multiple_choice.
 */
export class AnswerOptionInput {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * Custom decorator: проверяет, что массив answerOptions содержит ≥1 isCorrect:true.
 * Используется на полях `CreateQuestionRequest.answerOptions` / `UpdateQuestionRequest.answerOptions`.
 */
export function HasAtLeastOneCorrectOption(validationOptions?: ValidationOptions) {
  return function decorate(object: object, propertyName: string) {
    registerDecorator({
      name: 'hasAtLeastOneCorrectOption',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          return value.some(
            (opt) => opt && typeof opt === 'object' && (opt as AnswerOptionInput).isCorrect === true
          );
        },
        defaultMessage() {
          return 'answerOptions must contain at least one option with isCorrect:true';
        }
      }
    });
  };
}
