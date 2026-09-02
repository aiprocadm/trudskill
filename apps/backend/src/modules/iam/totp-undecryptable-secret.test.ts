import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthService, type TotpChallengeRequired } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { totpCodeForStep, totpStep } from './totp.util.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Журнал 332: сбой расшифровки секрета второго фактора выглядел как ошибка пользователя.
 *
 * Если секрет не расшифровывается (провёрнут ключ, побит шифртекст), проверка кода молча
 * возвращала `null`, и дальше всё шло по ветке «неверный код»: тот же ответ, то же событие
 * `totp_failed`, тот же счётчик `invalid_totp_code`. Человек с ПРАВИЛЬНЫМ кодом войти не
 * может, эксплуатант видит «путается в кодах», а настоящая причина — сбой ключа — не
 * попадает никуда.
 *
 * Ответ наружу обязан остаться прежним: подсказывать нападающему, что именно сломалось,
 * нельзя. Различать должны ЗАПИСИ, а не ответ.
 */
const T = 'tenant_demo';
const context = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
} as RequestContext;

const makeAuth = (incrementAuthFailure: (labels: Record<string, string>) => void): AuthService => {
  const audit = new AuditService();
  return new AuthService(new IamService(audit), audit, new SecretsService(), {
    incrementAuthFailure
  } as never);
};

const enableTotp = async (auth: AuthService): Promise<string> => {
  const { secret } = await auth.setupTotp(T, 'u_tenant_admin', context);
  await auth.confirmTotp(
    T,
    'u_tenant_admin',
    totpCodeForStep(secret, totpStep(Date.now())),
    context
  );
  return secret;
};

const challengeToken = async (auth: AuthService): Promise<string> =>
  auth.login(T, { login: 'tenant_admin', password: 'Password123!' }, context).then(
    () => {
      throw new Error('ожидался вызов второго фактора');
    },
    (err: TotpChallengeRequired) => err.challengeToken
  );

describe('второй фактор: нерасшифруемый секрет отличим от неверного кода', () => {
  it('сбой ключа помечается своей причиной, а не «неверным кодом»', async () => {
    const incrementAuthFailure = vi.fn();
    const auth = makeAuth(incrementAuthFailure);
    const secret = await enableTotp(auth);
    const challenge = await challengeToken(auth);

    // Ломаем расшифровку так же, как её ломает жизнь: провёрнутый ключ или побитый шифртекст.
    (auth as unknown as { totpCrypto: { decrypt: (v: string) => string } }).totpCrypto = {
      decrypt: () => {
        throw new Error('bad key');
      }
    };

    await expect(
      auth.verifyTotpAndLogin(T, challenge, totpCodeForStep(secret, totpStep(Date.now())), context)
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const reasons = incrementAuthFailure.mock.calls.map(
      (call) => (call[0] as { reason: string }).reason
    );
    expect(reasons).toContain('totp_secret_undecryptable');
    expect(reasons).not.toContain('invalid_totp_code');
  });

  it('ответ наружу не меняется: нападающему не подсказываем, что сломалось', async () => {
    const auth = makeAuth(vi.fn());
    const secret = await enableTotp(auth);
    const challenge = await challengeToken(auth);
    (auth as unknown as { totpCrypto: { decrypt: (v: string) => string } }).totpCrypto = {
      decrypt: () => {
        throw new Error('bad key');
      }
    };

    let code: string | undefined;
    try {
      await auth.verifyTotpAndLogin(
        T,
        challenge,
        totpCodeForStep(secret, totpStep(Date.now())),
        context
      );
    } catch (err) {
      code = ((err as UnauthorizedException).getResponse() as { code: string }).code;
    }

    expect(code).toBe('invalid_totp_code');
  });

  it('обычный неверный код по-прежнему помечается как неверный код', async () => {
    const incrementAuthFailure = vi.fn();
    const auth = makeAuth(incrementAuthFailure);
    await enableTotp(auth);
    const challenge = await challengeToken(auth);

    await expect(auth.verifyTotpAndLogin(T, challenge, '000000', context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    const reasons = incrementAuthFailure.mock.calls.map(
      (call) => (call[0] as { reason: string }).reason
    );
    expect(reasons).toContain('invalid_totp_code');
    expect(reasons).not.toContain('totp_secret_undecryptable');
  });
});
