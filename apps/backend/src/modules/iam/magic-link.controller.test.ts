import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AuthController } from './auth.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { InMemoryMagicLinkTokenRepo } from './services/in-memory-magic-link-token-repo.js';
import {
  type MagicLinkEmailSender,
  type SendMagicLinkInput
} from './services/magic-link-email-sender.js';
import { MagicLinkService } from './services/magic-link.service.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { Response } from 'express';

const context: RequestContext = {
  requestId: 'req_ml_1',
  correlationId: 'corr_ml_1',
  tenantId: 'tenant_demo',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noTenantContext: RequestContext = {
  requestId: 'req_ml_no_tenant',
  correlationId: 'corr_ml_no_tenant'
};

class CapturingEmailSender implements MagicLinkEmailSender {
  readonly sent: SendMagicLinkInput[] = [];
  async sendMagicLink(input: SendMagicLinkInput): Promise<void> {
    this.sent.push(input);
  }
}

class FakeResponse {
  readonly headers: Record<string, string | string[]> = {};
  setHeader(name: string, value: string | string[]): this {
    this.headers[name] = value;
    return this;
  }
}

const makeController = () => {
  const audit = new AuditService();
  const iam = new IamService(audit);
  const auth = new AuthService(iam, audit, new SecretsService());
  const magicLinkService = new MagicLinkService(new InMemoryMagicLinkTokenRepo(), {
    ttlMs: 15 * 60 * 1000
  });
  const sender = new CapturingEmailSender();

  return {
    controller: new AuthController(auth, iam, magicLinkService, sender),
    sender,
    iam,
    audit
  };
};

describe('AuthController.requestMagicLink', () => {
  it('returns { status: "sent" } and triggers the email sender', async () => {
    const { controller, sender } = makeController();

    const result = await controller.requestMagicLink(context, { email: 'new@example.ru' });

    expect(result).toEqual({ status: 'sent' });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].email).toBe('new@example.ru');
    expect(sender.sent[0].rawToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('always returns "sent" even for unknown email (no enumeration)', async () => {
    const { controller, sender } = makeController();

    const result = await controller.requestMagicLink(context, {
      email: 'definitely-does-not-exist@example.ru'
    });

    expect(result).toEqual({ status: 'sent' });
    expect(sender.sent).toHaveLength(1);
  });

  it('rejects request without a resolved tenant', async () => {
    const { controller } = makeController();

    await expect(controller.requestMagicLink(noTenantContext, { email: 'a@b.ru' })).rejects.toThrow(
      UnauthorizedException
    );
  });
});

describe('AuthController.redeemMagicLink', () => {
  it('completes the full flow: request → redeem → session tokens', async () => {
    const { controller, sender, iam } = makeController();

    await controller.requestMagicLink(context, { email: 'flow@example.ru' });
    const rawToken = sender.sent[0].rawToken;

    const tokens = await controller.redeemMagicLink(
      context,
      { token: rawToken },
      new FakeResponse() as unknown as Response
    );

    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('sessionId');
    expect(tokens).not.toHaveProperty('refreshToken');
    expect(tokens).not.toHaveProperty('csrfToken');

    const { user } = await iam.findOrCreateByEmail('tenant_demo', 'flow@example.ru');
    expect(user.email).toBe('flow@example.ru');
  });

  it('writes auth.magic_link_login audit on successful redeem', async () => {
    const { controller, sender, audit } = makeController();

    await controller.requestMagicLink(context, { email: 'audited@example.ru' });
    const rawToken = sender.sent[0].rawToken;

    await controller.redeemMagicLink(
      context,
      { token: rawToken },
      new FakeResponse() as unknown as Response
    );

    const records = await audit.list('tenant_demo');
    expect(records.some((r) => r.action === 'auth.magic_link_login')).toBe(true);
  });

  it('rejects an unknown token with 401', async () => {
    const { controller } = makeController();

    await expect(
      controller.redeemMagicLink(
        context,
        { token: 'totally-bogus-token-1234567890abcdef' },
        new FakeResponse() as unknown as Response
      )
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a single-use replay with 401', async () => {
    const { controller, sender } = makeController();

    await controller.requestMagicLink(context, { email: 'replay@example.ru' });
    const rawToken = sender.sent[0].rawToken;

    await controller.redeemMagicLink(
      context,
      { token: rawToken },
      new FakeResponse() as unknown as Response
    );

    await expect(
      controller.redeemMagicLink(
        context,
        { token: rawToken },
        new FakeResponse() as unknown as Response
      )
    ).rejects.toThrow(UnauthorizedException);
  });

  it('uses the same email-normalization on lookup as request did', async () => {
    const { controller, sender, iam } = makeController();

    await controller.requestMagicLink(context, { email: '  MIXED@x.RU  ' });
    const rawToken = sender.sent[0].rawToken;

    await controller.redeemMagicLink(
      context,
      { token: rawToken },
      new FakeResponse() as unknown as Response
    );

    const { user } = await iam.findOrCreateByEmail('tenant_demo', 'mixed@x.ru');
    expect(user.email).toBe('mixed@x.ru');
  });
});
