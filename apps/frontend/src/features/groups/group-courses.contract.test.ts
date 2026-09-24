import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupCourseDurationLabel, groupCourseTeacherLabel } from './group-courses-list';

import type { groupCoursesApi as GroupCoursesApi } from './group-courses-api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'curator',
    email: 'c@example.com',
    displayName: 'Куратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['curator'],
  permissions: ['groups.read', 'groups.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('курс в группе: срок и преподаватель (МГ-E4.5, срез 17.2)', () => {
  let api: typeof GroupCoursesApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    api = (await import('./group-courses-api')).groupCoursesApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('преподаватели — GET /group-courses/teachers с поиском; правка — PATCH /group-courses/:id', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(envelope({ items: [{ id: 'u_t', name: 'Андреев Андрей' }] }), { status: 200 })
    );
    await expect(api.teachers(session, 'анд')).resolves.toEqual({
      items: [{ id: 'u_t', name: 'Андреев Андрей' }]
    });
    await api.update(session, 'gc1', { durationDays: 36, teacherUserId: null });
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toContain('/group-courses/teachers?q=');
    expect(calls[1]?.[0]).toMatch(/\/group-courses\/gc1$/);
    expect(calls[1]?.[1].method).toBe('PATCH');
    expect(JSON.parse(String(calls[1]?.[1].body))).toEqual({
      durationDays: 36,
      teacherUserId: null
    });
  });

  it('подписи словами: срок и преподаватель без идентификаторов', () => {
    expect(groupCourseDurationLabel(36)).toBe('36 дн.');
    expect(groupCourseDurationLabel(undefined)).toBe('по сроку курса');
    const names = new Map([['u_t', 'Андреев Андрей']]);
    expect(groupCourseTeacherLabel('u_t', names)).toBe('Андреев Андрей');
    expect(groupCourseTeacherLabel(undefined, names)).toBe('не назначен');
    expect(groupCourseTeacherLabel('u_gone', names)).toBe('нет в списке преподавателей');
  });
});
