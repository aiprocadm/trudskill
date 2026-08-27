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

const context: RequestContext = {
  requestId: 'req_block_1',
  correlationId: 'corr_block_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

class NoopEmailSender implements MagicLinkEmailSender {
  async sendMagicLink(_input: SendMagicLinkInput): Promise<void> {
    /* не используется в этом тесте */
  }
}

const makeController = () => {
  const audit = new AuditService();
  const iam = new IamService(audit);
  const auth = new AuthService(iam, audit, new SecretsService());
  const magicLinkService = new MagicLinkService(new InMemoryMagicLinkTokenRepo(), {
    ttlMs: 15 * 60 * 1000
  });
  return {
    controller: new AuthController(auth, iam, magicLinkService, new NoopEmailSender()),
    auth,
    iam
  };
};

/**
 * Ревизия 2026-08-27 (порция 22, журнал 266): блокировка через PUT /users/:id обязана
 * отзывать живые сессии человека здесь же — иначе «заблокирован» означало лишь
 * «не сможет войти заново», а открытая вкладка работала до конца срока токена.
 */
describe('PUT /users/:id со status=blocked отзывает сессии (порция 22)', () => {
  it('после блокировки живая сессия человека мертва', async () => {
    const { controller, auth } = makeController();
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    await controller.updateUser(context, 'u_tenant_admin', { status: 'blocked' });
    await expect(
      auth.isSessionActive('tenant_demo', 'u_tenant_admin', login.sessionId)
    ).resolves.toBe(false);
  });

  it('обновление без блокировки сессии не трогает', async () => {
    const { controller, auth } = makeController();
    const login = await auth.login(
      'tenant_demo',
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    await controller.updateUser(context, 'u_tenant_admin', { displayName: 'Новое имя' });
    await expect(
      auth.isSessionActive('tenant_demo', 'u_tenant_admin', login.sessionId)
    ).resolves.toBe(true);
  });
});
