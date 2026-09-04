import { describe, expect, it } from 'vitest';

import { getVisibleNavigation, resolveRouteMeta } from './helpers';
import { navigationModel } from './model';

import type { UserSession } from '../../entities/session/model';

/**
 * Право экрана — это право его ДАННЫХ: то же, что стоит на ручках бэкенда, которые экран
 * вызывает (журнал 343, §5.418). Пятнадцать экранов сотрудников стояли под `tenant.read` —
 * оно есть у всех ролей, включая слушателя, — и слушатель видел их в меню «Ещё»: одни
 * отвечали ему 403 (ручки под `documents.read`, `integrations.read`, …), другие показывали
 * данные сотрудников (оперативная панель, ход настройки центра, состав комиссии).
 *
 * Сторож класса — `apps/backend/src/common/guards/learner-reaches-staff-screen`. Здесь —
 * таблица решений «экран → право», чтобы правка карты не сделала право уже или шире, чем
 * у ручек.
 */
const SCREEN_RIGHTS: ReadonlyArray<{ path: string; permission: string; api: string }> = [
  { path: '/documents', permission: 'documents.read', api: 'GET /templates, GET /document-tasks' },
  {
    path: '/admin/issuance-journal',
    permission: 'documents.read',
    api: 'GET /admin/documents/issuance-journal'
  },
  {
    path: '/forms',
    permission: 'documents.read',
    api: 'анкеты собираются в «Документах» (журнал 197)'
  },
  {
    path: '/integrations',
    permission: 'integrations.read',
    api: 'GET /integrations/providers, …/credentials'
  },
  { path: '/exports', permission: 'integrations.read', api: 'GET /exports/tasks' },
  { path: '/sync-logs', permission: 'integrations.read', api: 'GET /sync-logs' },
  {
    path: '/telephony',
    permission: 'integrations.read',
    api: 'GET /integrations/providers, …/credentials'
  },
  {
    path: '/mailings',
    permission: 'notifications.read',
    api: 'GET /email-deliveries, GET /email-templates'
  },
  {
    path: '/proctoring',
    permission: 'proctoring.read',
    api: 'назначения на контроль, GET /sync-logs'
  },
  { path: '/crm/deals', permission: 'counterparties.read', api: 'GET /counterparties' },
  { path: '/onboarding', permission: 'tenant.settings.write', api: 'GET /tenant/onboarding' },
  { path: '/academy', permission: 'tenant.settings.write', api: 'узел настроек центра' },
  {
    path: '/academy/requisites',
    permission: 'tenant.settings.write',
    api: 'PUT /tenant/requisites, PUT /tenant/settings'
  },
  {
    path: '/academy/commission',
    permission: 'learning.commissions.read',
    api: 'GET /tenant/commission — состав комиссии'
  },
  {
    path: '/workspace',
    permission: 'workspace.read',
    api: 'GET /workspace/summary, /tasks/inbox, /blockers (0091)'
  }
];

const session = (permissions: string[]): UserSession => ({
  user: {
    id: 'u',
    tenantId: 'tenant_demo',
    login: 'u',
    email: null,
    status: 'active',
    displayName: 'U'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
  roles: [],
  permissions
});

describe('право экрана совпадает с правом его данных (журнал 343)', () => {
  for (const { path, permission, api } of SCREEN_RIGHTS) {
    it(`${path} — ${permission} (${api})`, () => {
      expect(resolveRouteMeta(path)?.requiredPermissions).toEqual([permission]);
    });
  }

  it('пункт меню требует то же право, что и его экран', () => {
    for (const { path, permission } of SCREEN_RIGHTS) {
      const item = navigationModel.find((entry) => entry.href === path);
      if (!item) continue; // /forms, /mailings, /crm/deals в меню не выведены (журнал 197)
      expect(item.requiredPermissions, path).toEqual([permission]);
    }
  });

  it('слушателю с одним лишь tenant.read эти разделы в меню не показываются', () => {
    const visible = getVisibleNavigation(session(['tenant.read'])).map((item) => item.href);
    for (const { path } of SCREEN_RIGHTS) {
      expect(visible, path).not.toContain(path);
    }
  });
});
