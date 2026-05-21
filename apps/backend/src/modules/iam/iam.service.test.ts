import { describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { IamService } from './services/iam.service.js';

describe('IamService.findOrCreateByEmail', () => {
  it('returns the existing seed user when email matches a fallback user', async () => {
    const iam = new IamService(new AuditService());

    const { user, databaseBacked } = await iam.findOrCreateByEmail(
      'tenant_demo',
      'tenant@demo.local'
    );

    expect(user.id).toBe('u_tenant_admin');
    expect(user.email).toBe('tenant@demo.local');
    expect(user.tenantId).toBe('tenant_demo');
    expect(databaseBacked).toBe(false);
  });

  it('creates a new active user when no user matches the email', async () => {
    const iam = new IamService(new AuditService());

    const { user, databaseBacked } = await iam.findOrCreateByEmail(
      'tenant_demo',
      'fresh@example.ru'
    );

    expect(user.email).toBe('fresh@example.ru');
    expect(user.status).toBe('active');
    expect(user.tenantId).toBe('tenant_demo');
    expect(user.displayName).toBeTruthy();
    expect(user.passwordHash).toBeTruthy();
    expect(user.id).toMatch(/^u_/);
    expect(databaseBacked).toBe(false);
  });

  it('is idempotent: repeated calls for the same email return the same user', async () => {
    const iam = new IamService(new AuditService());

    const first = await iam.findOrCreateByEmail('tenant_demo', 'idemp@example.ru');
    const second = await iam.findOrCreateByEmail('tenant_demo', 'idemp@example.ru');

    expect(second.user.id).toBe(first.user.id);
  });

  it('normalizes email to lowercase and trims before lookup', async () => {
    const iam = new IamService(new AuditService());

    const upper = await iam.findOrCreateByEmail('tenant_demo', '  MixedCase@X.RU ');
    expect(upper.user.email).toBe('mixedcase@x.ru');

    const followup = await iam.findOrCreateByEmail('tenant_demo', 'MIXEDCASE@x.ru');
    expect(followup.user.id).toBe(upper.user.id);
  });

  it('isolates users by tenant', async () => {
    const iam = new IamService(new AuditService());

    const t1 = await iam.findOrCreateByEmail('tenant_demo', 'cross@example.ru');
    const t2 = await iam.findOrCreateByEmail('tenant_other', 'cross@example.ru');

    expect(t1.user.id).not.toBe(t2.user.id);
    expect(t1.user.tenantId).toBe('tenant_demo');
    expect(t2.user.tenantId).toBe('tenant_other');
  });

  it('created user has an unguessable password hash (cannot login with empty password)', async () => {
    const iam = new IamService(new AuditService());

    const { user } = await iam.findOrCreateByEmail('tenant_demo', 'no-pass@example.ru');

    expect(user.passwordHash.length).toBeGreaterThan(20);
    expect(user.passwordHash).not.toBe('');
  });
});
