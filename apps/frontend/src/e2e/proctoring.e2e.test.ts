/**
 * Phase 4 Plan B — E2E smoke для прокторинга (admin queue + detail + learner-flow модули).
 * Конвенции проекта: routing/permission через evaluateRouteAccess + getVisibleNavigation,
 * dynamic-import smoke; реального React mount нет (RTL не в зависимостях).
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithProctoringRead: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['proctoring.read']
};

const adminUnrelated: UserSession = { ...adminWithProctoringRead, permissions: ['courses.read'] };

describe('proctoring — routing', () => {
  it('/admin/proctoring-recordings: allowed with proctoring.read', () => {
    expect(evaluateRouteAccess('/admin/proctoring-recordings', adminWithProctoringRead)).toEqual({
      kind: 'ok'
    });
  });

  it('/admin/proctoring-recordings: forbidden without proctoring.read', () => {
    expect(evaluateRouteAccess('/admin/proctoring-recordings', adminUnrelated)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/admin/proctoring-recordings/[id] detail: allowed with proctoring.read, forbidden without', () => {
    expect(
      evaluateRouteAccess('/admin/proctoring-recordings/prec-abc-1', adminWithProctoringRead)
    ).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/proctoring-recordings/prec-abc-1', adminUnrelated)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/admin/proctoring-recordings: redirect-login when no session', () => {
    expect(evaluateRouteAccess('/admin/proctoring-recordings', null)).toEqual({
      kind: 'redirect-login'
    });
  });

  it('the legacy /proctoring stub route is untouched (tenant.read, not proctoring.read)', () => {
    expect(evaluateRouteAccess('/proctoring', adminWithProctoringRead)).toEqual({
      kind: 'forbidden'
    });
  });
});

describe('proctoring — navigation visibility', () => {
  it('«Записи прокторинга» visible only with proctoring.read', () => {
    expect(getVisibleNavigation(adminWithProctoringRead).map((i) => i.href)).toContain(
      '/admin/proctoring-recordings'
    );
    expect(getVisibleNavigation(adminUnrelated).map((i) => i.href)).not.toContain(
      '/admin/proctoring-recordings'
    );
  });
});

describe('proctoring — module smoke', () => {
  it('screens module loads and exports the four components', async () => {
    const mod = await import('../features/proctoring/screens');
    expect(typeof mod.ProctoringStartPanel).toBe('function');
    expect(typeof mod.ProctoringRecIndicator).toBe('function');
    expect(typeof mod.AdminProctoringQueueScreen).toBe('function');
    expect(typeof mod.AdminProctoringDetailScreen).toBe('function');
  });

  it('recorder + active-recording + hooks + format modules load', async () => {
    const recorder = await import('../features/proctoring/recorder');
    expect(typeof recorder.ProctoringRecorder).toBe('function');
    const holder = await import('../features/proctoring/active-recording');
    expect(typeof holder.stopAndCompleteActiveProctoring).toBe('function');
    const hooks = await import('../features/proctoring/hooks');
    expect(typeof hooks.useProctoringQueue).toBe('function');
    expect(typeof hooks.useProctoringDetail).toBe('function');
    const format = await import('../features/proctoring/format');
    expect(typeof format.formatProctoringStatus).toBe('function');
    expect(typeof format.chunkIssueLabel).toBe('function');
  });
});
