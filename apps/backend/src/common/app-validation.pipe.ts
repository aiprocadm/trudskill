import { BadRequestException, type Type, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import type { ValidationError } from 'class-validator';

/** Ручная валидация DTO там, где `emitDecoratorMetadata` в контроллере недоступен (напр. некоторые Vitest pipeline). */
export function assertValidDto<T extends object>(Cls: Type<T>, plain: unknown): T {
  const inst = plainToInstance(Cls, plain as object);
  const errors = validateSync(inst as object, { whitelist: true, forbidNonWhitelisted: true });
  if (!errors.length) {
    return inst;
  }
  const message =
    errors.flatMap((e) => (e.constraints ? Object.values(e.constraints) : [])).join('; ') ||
    'validation_failed';
  throw new BadRequestException({
    code: 'validation_error',
    message
  });
}

/** Единый ValidationPipe для prod и HTTP harness: whitelist + code `validation_error` в теле ответа. */
export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: false,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: 'validation_error',
        message:
          errors.flatMap((e) => (e.constraints ? Object.values(e.constraints) : [])).join('; ') ||
          'validation_failed'
      })
  });
}
