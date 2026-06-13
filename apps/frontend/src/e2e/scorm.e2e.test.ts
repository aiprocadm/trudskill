/**
 * Phase 9 Plan A — E2E smoke for SCORM (route access, navigation, CMI pipeline, module smoke).
 * Conventions: NO React Testing Library / no render — only evaluateRouteAccess +
 * getVisibleNavigation from navigation/helpers, pure pipeline integration, and
 * dynamic-import smoke.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

// /scorm requires materials.read (verified in apps/frontend/src/features/navigation/model.ts line 37).
const sessionWithMaterialsRead: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'tok', sessionId: 's1', expiresIn: 3600 },
  roles: ['tenant_admin'],
  permissions: ['materials.read']
};

const sessionWithoutMaterialsRead: UserSession = {
  ...sessionWithMaterialsRead,
  permissions: ['courses.read']
};

describe('scorm — routing', () => {
  it('/scorm: allowed with materials.read', () => {
    expect(evaluateRouteAccess('/scorm', sessionWithMaterialsRead)).toEqual({ kind: 'ok' });
  });

  it('/scorm: forbidden without materials.read', () => {
    expect(evaluateRouteAccess('/scorm', sessionWithoutMaterialsRead)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/scorm: redirect-login when session is null', () => {
    expect(evaluateRouteAccess('/scorm', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('scorm — navigation visibility', () => {
  it('«SCORM» nav entry visible with materials.read, absent without', () => {
    const hrefs = getVisibleNavigation(sessionWithMaterialsRead).map((i) => i.href);
    expect(hrefs).toContain('/scorm');

    const hrefsWithout = getVisibleNavigation(sessionWithoutMaterialsRead).map((i) => i.href);
    expect(hrefsWithout).not.toContain('/scorm');
  });
});

describe('scorm — CMI pipeline integration (pure functions)', () => {
  it('buildInitialCmi + buildCommitPayload round-trip for a passed attempt', async () => {
    const { buildInitialCmi, buildCommitPayload, parseScormSessionTime } =
      await import('../features/scorm/cmi-mapping');

    // Minimal ScormAttemptDto-shaped object (launch response).
    const attempt = {
      id: 'att-1',
      enrollmentId: 'enr-1',
      materialId: 'mat-1',
      lessonStatus: 'not attempted' as const,
      totalSeconds: 0,
      startedAt: new Date().toISOString()
    };

    const initialCmi = buildInitialCmi(attempt, {
      studentId: 'u_student',
      studentName: 'Иванов Иван'
    });

    // Initial CMI should carry student identity and lesson_status.
    expect((initialCmi as { core: { student_id: string } }).core.student_id).toBe('u_student');
    expect((initialCmi as { core: { student_name: string } }).core.student_name).toBe(
      'Иванов Иван'
    );
    expect((initialCmi as { core: { lesson_status: string } }).core.lesson_status).toBe(
      'not attempted'
    );

    // Simulate a completed play session snapshot coming out of scorm-again.
    const simulatedCmiSnapshot = {
      core: {
        lesson_status: 'passed',
        session_time: '00:10:00',
        score: { raw: '85', max: '100', min: '0' }
      }
    };

    const payload = buildCommitPayload(simulatedCmiSnapshot);

    expect(payload.lessonStatus).toBe('passed');
    // 00:10:00 = 600 seconds
    expect(payload.sessionSeconds).toBe(600);
    expect(payload.scoreRaw).toBe(85);
    expect(payload.scoreMax).toBe(100);
    expect(payload.scoreMin).toBe(0);

    // Also verify parseScormSessionTime directly.
    expect(parseScormSessionTime('00:10:00')).toBe(600);
    expect(parseScormSessionTime('01:30:15')).toBe(5415);
    expect(parseScormSessionTime('')).toBe(0);
    expect(parseScormSessionTime('garbage')).toBe(0);
  });
});

describe('scorm — module smoke', () => {
  it('api module loads and exposes scormApi + putFileToPresignedUrl', async () => {
    const mod = await import('../features/scorm/api');
    expect(typeof mod.scormApi).toBe('object');
    expect(typeof mod.scormApi.launch).toBe('function');
    expect(typeof mod.scormApi.commit).toBe('function');
    expect(typeof mod.putFileToPresignedUrl).toBe('function');
  });

  it('screens module loads and exports ScormPackagesScreen', async () => {
    const mod = await import('../features/scorm/screens');
    expect(typeof mod.ScormPackagesScreen).toBe('function');
  });

  it('scorm-player module loads and exports ScormPlayer (scorm-again imported lazily in effect — safe in node)', async () => {
    // scorm-again is only imported via dynamic import() INSIDE a useEffect (browser-only),
    // so the module top-level is safe to import in vitest/node environments.
    const mod = await import('../features/scorm/scorm-player');
    expect(typeof mod.ScormPlayer).toBe('function');
  });
});
