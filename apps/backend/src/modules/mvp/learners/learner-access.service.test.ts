import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { LearnerAccessService } from './learner-access.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { LoggingMagicLinkEmailSender } from '../../iam/services/magic-link-email-sender.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { IamService } from '../../iam/services/iam.service.js';
import type { MagicLinkEmailSender } from '../../iam/services/magic-link-email-sender.js';
import type { MagicLinkService } from '../../iam/services/magic-link.service.js';
import type { MvpService } from '../mvp.service.js';
import type { Learner } from '../mvp.types.js';

const T = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'r0',
  correlationId: 'c0',
  tenantId: T,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeService(options?: {
  learner?: Partial<Learner>;
  roles?: string[];
  rawToken?: string | null;
  logging?: boolean;
  rolesFail?: boolean;
}) {
  const learner: Learner = {
    id: 'l_1',
    tenantId: T,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    firstName: 'Иван',
    lastName: 'Иванов',
    email: 'Ivanov@Example.com',
    ...options?.learner
  };
  const mvp = {
    getLearner: vi.fn(() => learner),
    linkLearnerToIamUser: vi.fn()
  } as unknown as MvpService;
  const iam = {
    findOrCreateByEmail: vi.fn(async (_t: string, email: string) => ({
      user: { id: 'u_learner', email, displayName: email },
      databaseBacked: true
    })),
    getUserRoles: vi.fn(async () => (options?.roles ?? []).map((code) => ({ code }))),
    setUserRoles: vi.fn(async () => {
      if (options?.rolesFail) throw new Error('role_not_found');
      return [];
    })
  } as unknown as IamService;
  const magicLinks = {
    requestLink: vi.fn(async () => ({
      rawToken: options?.rawToken === undefined ? 'tok' : options.rawToken
    }))
  } as unknown as MagicLinkService;
  const sender = options?.logging
    ? new LoggingMagicLinkEmailSender()
    : ({ sendMagicLink: vi.fn(async () => undefined) } as unknown as MagicLinkEmailSender);
  const audit = new AuditService();
  const service = new LearnerAccessService(mvp, iam, magicLinks, sender, audit);
  return { service, mvp, iam, magicLinks, sender, audit };
}

/** «Выслать доступ» слушателю (МГ-C2.1, срез 9.3, РМ97–РМ99). */
describe('LearnerAccessService', () => {
  it('создаёт учётку по почте, привязывает к слушателю, даёт роль learner, шлёт ссылку и пишет аудит без почты', async () => {
    const { service, mvp, iam, magicLinks, sender, audit } = makeService();
    const outcome = await service.send(T, 'l_1', 'u_admin', ctx);
    expect(outcome).toEqual({ status: 'sent', userId: 'u_learner', linked: true });
    expect(iam.findOrCreateByEmail).toHaveBeenCalledWith(T, 'ivanov@example.com');
    expect(mvp.linkLearnerToIamUser).toHaveBeenCalledWith(T, 'l_1', 'u_learner');
    expect(iam.setUserRoles).toHaveBeenCalledWith(
      T,
      'u_learner',
      ['learner'],
      'u_admin',
      'r0',
      'c0'
    );
    expect(magicLinks.requestLink).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: T, email: 'ivanov@example.com' })
    );
    expect(
      (sender as { sendMagicLink: ReturnType<typeof vi.fn> }).sendMagicLink
    ).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ivanov@example.com', rawToken: 'tok' })
    );
    const record = (await audit.listPage(T, { action: 'learning.learner_access_sent' })).items[0];
    expect(record?.entityId).toBe('l_1');
    expect(record?.newValues).toEqual({ status: 'sent', userId: 'u_learner', linked: true });
    expect(JSON.stringify(record)).not.toContain('example.com');
  });

  it('без почты — 400 с понятным кодом, учётка не создаётся', async () => {
    const { service, iam } = makeService({ learner: { email: undefined } });
    await expect(service.send(T, 'l_1', 'u_admin', ctx)).rejects.toMatchObject({
      response: { code: 'learner_no_email' }
    });
    await expect(service.send(T, 'l_1', 'u_admin', ctx)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(iam.findOrCreateByEmail).not.toHaveBeenCalled();
  });

  it('уже привязанный слушатель с ролями: ни привязки, ни смены ролей; предел — throttled', async () => {
    const { service, mvp, iam } = makeService({
      learner: { linkedIamUserId: 'u_learner' },
      roles: ['manager'],
      rawToken: null
    });
    const outcome = await service.send(T, 'l_1', 'u_admin', ctx);
    expect(outcome).toEqual({ status: 'throttled', userId: 'u_learner', linked: false });
    expect(mvp.linkLearnerToIamUser).not.toHaveBeenCalled();
    expect(iam.setUserRoles).not.toHaveBeenCalled();
  });

  it('стенд без почты — logged; отказ в назначении роли не мешает отправке', async () => {
    const { service } = makeService({ logging: true, rolesFail: true });
    const outcome = await service.send(T, 'l_1', 'u_admin', ctx);
    expect(outcome.status).toBe('logged');
  });
});
