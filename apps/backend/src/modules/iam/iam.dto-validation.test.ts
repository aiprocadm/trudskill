import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { LoginDto, RefreshDto } from './dto/login.dto.js';
import { MagicLinkRedeemDto, MagicLinkRequestDto } from './dto/magic-link.dto.js';

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

  it('accepts empty refresh payload because refresh token comes from cookie', async () => {
    await expect(
      validationPipe.transform({}, { type: 'body', metatype: RefreshDto, data: 'payload' })
    ).resolves.toEqual({});
  });

  it('rejects payloads with non-whitelisted fields', async () => {
    await expect(
      validationPipe.transform(
        { login: 'tenant_admin', password: 'Password123!', extra: true },
        { type: 'body', metatype: LoginDto, data: 'payload' }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('MagicLinkRequestDto', () => {
    it('accepts a valid email', async () => {
      await expect(
        validationPipe.transform(
          { email: 'user@example.ru' },
          { type: 'body', metatype: MagicLinkRequestDto, data: 'payload' }
        )
      ).resolves.toMatchObject({ email: 'user@example.ru' });
    });

    it('rejects payload without email', async () => {
      await expect(
        validationPipe.transform(
          {},
          { type: 'body', metatype: MagicLinkRequestDto, data: 'payload' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects malformed email', async () => {
      await expect(
        validationPipe.transform(
          { email: 'not-an-email' },
          { type: 'body', metatype: MagicLinkRequestDto, data: 'payload' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects extra fields (e.g. password leak)', async () => {
      await expect(
        validationPipe.transform(
          { email: 'a@b.ru', password: 'secret' },
          { type: 'body', metatype: MagicLinkRequestDto, data: 'payload' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('MagicLinkRedeemDto', () => {
    it('accepts a token of valid length', async () => {
      await expect(
        validationPipe.transform(
          { token: 'a'.repeat(43) },
          { type: 'body', metatype: MagicLinkRedeemDto, data: 'payload' }
        )
      ).resolves.toMatchObject({ token: 'a'.repeat(43) });
    });

    it('rejects payload without token', async () => {
      await expect(
        validationPipe.transform(
          {},
          { type: 'body', metatype: MagicLinkRedeemDto, data: 'payload' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects short token (< 20 chars)', async () => {
      await expect(
        validationPipe.transform(
          { token: 'too-short' },
          { type: 'body', metatype: MagicLinkRedeemDto, data: 'payload' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects overly long token (> 200 chars)', async () => {
      await expect(
        validationPipe.transform(
          { token: 'x'.repeat(201) },
          { type: 'body', metatype: MagicLinkRedeemDto, data: 'payload' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
