import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, TotpChallengeRequired } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { totpCodeForStep, totpStep } from './totp.util.js';

const T = 'tenant_demo';
const context = {
  requestId: 'req_totp_1',
  correlationId: 'corr_totp_1',
  tenantId: T,
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeAuth() {
  const audit = new AuditService();
  return new AuthService(new IamService(audit), audit, new SecretsService());
}

/** Полный цикл включения 2FA у tenant_admin: setup → confirm текущим кодом. */
async function enableTotp(auth: AuthService): Promise<{ secret: string }> {
  const { secret, otpauthUrl } = await auth.setupTotp(T, 'u_tenant_admin', context);
  expect(otpauthUrl).toContain('otpauth://totp/');
  const code = totpCodeForStep(secret, totpStep(Date.now()));
  await auth.confirmTotp(T, 'u_tenant_admin', code, context);
  return { secret };
}

/** Код следующего шага: confirm уже сжёг текущий шаг (anti-replay), окно ±1 примет следующий. */
function nextStepCode(secret: string): { code: string; step: number } {
  const step = totpStep(Date.now()) + 1;
  return { code: totpCodeForStep(secret, step), step };
}

describe('2FA TOTP (ФТ-G3)', () => {
  it('password login with 2FA enabled yields a challenge, not a session', async () => {
    const auth = makeAuth();
    await enableTotp(auth);
    await expect(
      auth.login(T, { login: 'tenant_admin', password: 'Password123!' }, context)
    ).rejects.toBeInstanceOf(TotpChallengeRequired);
  });

  it('challenge + valid code completes the login with tokens', async () => {
    const auth = makeAuth();
    const { secret } = await enableTotp(auth);
    const challenge = await auth
      .login(T, { login: 'tenant_admin', password: 'Password123!' }, context)
      .then(
        () => {
          throw new Error('expected TotpChallengeRequired');
        },
        (err: TotpChallengeRequired) => err.challengeToken
      );
    const { code } = nextStepCode(secret);
    const tokens = await auth.verifyTotpAndLogin(T, challenge, code, context);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.sessionId).toBeTruthy();
    expect(tokens.claims.role_codes).toContain('tenant_admin');
  });

  it('rejects a wrong code and a replayed code', async () => {
    const auth = makeAuth();
    const { secret } = await enableTotp(auth);
    const getChallenge = () =>
      auth.login(T, { login: 'tenant_admin', password: 'Password123!' }, context).then(
        () => {
          throw new Error('expected TotpChallengeRequired');
        },
        (err: TotpChallengeRequired) => err.challengeToken
      );

    await expect(
      auth.verifyTotpAndLogin(T, await getChallenge(), '000000', context)
    ).rejects.toMatchObject({ response: { code: 'invalid_totp_code' } });

    const { code } = nextStepCode(secret);
    await auth.verifyTotpAndLogin(T, await getChallenge(), code, context);
    // Тот же код второй раз — шаг уже сожжён (anti-replay).
    await expect(
      auth.verifyTotpAndLogin(T, await getChallenge(), code, context)
    ).rejects.toMatchObject({ response: { code: 'invalid_totp_code' } });
  });

  it('rejects a tampered challenge and a challenge for another tenant', async () => {
    const auth = makeAuth();
    await enableTotp(auth);
    await expect(auth.verifyTotpAndLogin(T, 'garbage.token', '123456', context)).rejects.toThrow(
      UnauthorizedException
    );
    const challenge = await auth
      .login(T, { login: 'tenant_admin', password: 'Password123!' }, context)
      .then(
        () => {
          throw new Error('expected TotpChallengeRequired');
        },
        (err: TotpChallengeRequired) => err.challengeToken
      );
    await expect(
      auth.verifyTotpAndLogin('tenant_other', challenge, '123456', {
        ...context,
        tenantId: 'tenant_other'
      })
    ).rejects.toMatchObject({ response: { code: 'invalid_totp_challenge' } });
  });

  it('magic-link and esia session issuance are gated too (issueSessionForUser)', async () => {
    const auth = makeAuth();
    await enableTotp(auth);
    const iam = new IamService(new AuditService());
    const { user } = (await iam.findUserByLogin(T, 'tenant_admin'))!;
    // Пользователь из свежего IamService не знает про включённую 2FA — берём защищаемого юзера
    // из того же инстанса, что и auth (in-memory состояние живёт в IamService).
    const guarded = { ...user, totpEnabled: true };
    for (const authMethod of ['magic_link', 'esia'] as const) {
      await expect(
        auth.issueSessionForUser(guarded, context, { authMethod, databaseBacked: false })
      ).rejects.toBeInstanceOf(TotpChallengeRequired);
    }
  });

  it('non-admin roles cannot start 2FA setup', async () => {
    const auth = makeAuth();
    await expect(
      auth.setupTotp(T, 'u_manager', { ...context, userId: 'u_manager' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('confirm requires a prior setup; disable requires a valid current code', async () => {
    const auth = makeAuth();
    await expect(auth.confirmTotp(T, 'u_tenant_admin', '123456', context)).rejects.toMatchObject({
      response: { code: 'totp_not_configured' }
    });

    const { secret } = await enableTotp(auth);
    await expect(auth.disableTotp(T, 'u_tenant_admin', '000000', context)).rejects.toMatchObject({
      response: { code: 'invalid_totp_code' }
    });
    const { code } = nextStepCode(secret);
    const disabled = await auth.disableTotp(T, 'u_tenant_admin', code, context);
    expect(disabled).toEqual({ enabled: false });
    // После выключения обычный логин снова выдаёт сессию сразу.
    const tokens = await auth.login(
      T,
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    expect(tokens.accessToken).toBeTruthy();
  });

  it('status reflects the lifecycle: eligible → pending → enabled → disabled', async () => {
    const auth = makeAuth();
    expect(await auth.getTotpStatus(T, 'u_tenant_admin')).toMatchObject({
      enabled: false,
      pending: false,
      eligible: true
    });
    const { secret } = await auth.setupTotp(T, 'u_tenant_admin', context);
    expect(await auth.getTotpStatus(T, 'u_tenant_admin')).toMatchObject({
      enabled: false,
      pending: true
    });
    await auth.confirmTotp(
      T,
      'u_tenant_admin',
      totpCodeForStep(secret, totpStep(Date.now())),
      context
    );
    expect(await auth.getTotpStatus(T, 'u_tenant_admin')).toMatchObject({ enabled: true });
    expect(await auth.getTotpStatus(T, 'u_manager')).toMatchObject({ eligible: false });
  });
});
