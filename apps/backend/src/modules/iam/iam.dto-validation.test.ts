import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { LoginDto, RefreshDto } from './dto/login.dto.js';

const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidUnknownValues: false,
  forbidNonWhitelisted: true
});

describe('IAM DTO validation', () => {
  it('rejects login payload without password', async () => {
    await expect(
      validationPipe.transform(
        { login: 'tenant_admin' },
        { type: 'body', metatype: LoginDto, data: 'payload' }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects refresh payload without refreshToken', async () => {
    await expect(
      validationPipe.transform({}, { type: 'body', metatype: RefreshDto, data: 'payload' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payloads with non-whitelisted fields', async () => {
    await expect(
      validationPipe.transform(
        { login: 'tenant_admin', password: 'Password123!', extra: true },
        { type: 'body', metatype: LoginDto, data: 'payload' }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
