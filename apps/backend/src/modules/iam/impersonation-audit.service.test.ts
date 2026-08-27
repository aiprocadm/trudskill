import { describe, expect, it } from 'vitest';

import { verifySignedAccessToken } from './crypto.util.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { IamService } from './services/iam.service.js';
import { SecretsService } from '../../infrastructure/secrets/secrets.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const T = 'tenant_demo';

const context: RequestContext = {
  requestId: 'req_imp',
  correlationId: 'corr_imp',
  tenantId: T,
  userId: 'u_platform_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const makeAuth = () => {
  const audit = new AuditService();
  const iam = new IamService(audit);
  const secrets = new SecretsService();
  return { auth: new AuthService(iam, audit, secrets), audit, secrets };
};

/*
 * Ревизия 2026-08-27 (порция 33, журнал 270).
 *
 * Поддержка платформы может войти «от имени» администратора центра. В журнал писался
 * только САМ ВХОД, а дальше действия шли от имени цели и были неотличимы от её
 * собственных: по журналу нельзя ответить на вопрос «это сделал наш клиент или наш
 * сотрудник поддержки». Для доказательной базы (152-ФЗ, разбор обращений) это и есть
 * главный вопрос.
 *
 * Признак живёт в СЕССИИ и едет в токене: иначе после первого обновления токена пометка
 * исчезла бы, а доступ остался. Прецедент пометки в проекте уже есть — `metadata.delegated`
 * у действий преподавателя за слушателя.
 */
describe('вход «от имени» помечается (порция 33)', () => {
  it('токен имперсонированной сессии несёт, КТО вошёл от имени', async () => {
    const { auth, secrets } = makeAuth();

    const session = await auth.issueImpersonatedSession(T, 'u_tenant_admin', 'u_platform_admin');
    const claims = verifySignedAccessToken(session.accessToken, secrets.getJwtSigningSecret());

    expect(claims?.sub).toBe('u_tenant_admin');
    expect(claims?.impersonated_by).toBe('u_platform_admin');
  });

  it('обычный вход пометки не несёт', async () => {
    const { auth, secrets } = makeAuth();

    const session = await auth.login(
      T,
      { login: 'tenant_admin', password: 'Password123!' },
      context
    );
    const claims = verifySignedAccessToken(session.accessToken, secrets.getJwtSigningSecret());

    expect(claims?.impersonated_by).toBeUndefined();
  });

  it('пометка переживает обновление токена — иначе она исчезла бы через минуты', async () => {
    const { auth, secrets } = makeAuth();
    const first = await auth.issueImpersonatedSession(T, 'u_tenant_admin', 'u_platform_admin');

    const rotated = await auth.refresh(T, first.refreshToken, first.csrfToken, context);
    const claims = verifySignedAccessToken(rotated.accessToken, secrets.getJwtSigningSecret());

    expect(claims?.impersonated_by).toBe('u_platform_admin');
  });

  it('в журнале действие, совершённое от имени, названо своим именем', async () => {
    const { audit } = makeAuth();

    audit.write({
      tenantId: T,
      actorId: 'u_tenant_admin',
      action: 'learning.learner_created',
      entityType: 'learning.learner',
      entityId: 'lrn_1',
      impersonatedBy: 'u_platform_admin'
    });

    const entry = (await audit.list(T)).find((item) => item.entityId === 'lrn_1');
    expect(entry?.metadata?.impersonated).toBe(true);
    expect(entry?.metadata?.impersonated_by).toBe('u_platform_admin');
  });
});
