import { hashPassword } from '../modules/iam/crypto.util.js';

export const devSeed = {
  tenants: [{ id: 'tenant_demo', code: 'demo', name: 'Demo Tenant', status: 'active' }],
  tenantRequisites: [
    {
      id: 'tr_demo',
      tenantId: 'tenant_demo',
      legalName: 'ООО Демо Академия',
      taxNumber: '7700000000'
    }
  ],
  tenantSettings: [{ id: 'ts_demo', tenantId: 'tenant_demo', payload: { locale: 'ru-RU' } }],
  permissions: [
    { id: 'perm_1', code: 'auth.manage_sessions' },
    { id: 'perm_2', code: 'iam.manage_roles' },
    { id: 'perm_3', code: 'tenant.read' }
  ],
  roles: ['platform_admin', 'tenant_admin', 'manager', 'methodist', 'learner'],
  users: [
    { login: 'platform_admin', status: 'active', passwordHash: hashPassword('Password123!') },
    { login: 'tenant_admin', status: 'active', passwordHash: hashPassword('Password123!') },
    { login: 'manager', status: 'active', passwordHash: hashPassword('Password123!') },
    { login: 'methodist', status: 'active', passwordHash: hashPassword('Password123!') },
    { login: 'learner', status: 'active', passwordHash: hashPassword('Password123!') },
    { login: 'blocked_user', status: 'blocked', passwordHash: hashPassword('Password123!') }
  ]
};
