import { describe, expect, it, vi } from 'vitest';

import { workspaceApi } from './api';

import type { UserSession } from '../../entities/session/model';

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'u1',
    email: null,
    status: 'active',
    displayName: 'User One'
  },
  roles: [],
  permissions: [],
  tokens: { accessToken: 'tok', sessionId: 's1', expiresIn: 3600 }
};

describe('workspaceApi', () => {
  it('loadDashboard aggregates inbox and blockers lists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const auth = (init?.headers as Headers)?.get('authorization');
      expect(auth).toBe('Bearer tok');
      if (url.includes('/workspace/summary')) {
        return new Response(
          JSON.stringify({
            data: { overdueCount: 1, blockersCount: 2, nextActions: [] },
            meta: {
              requestId: 'r1',
              correlationId: 'c1',
              timestamp: new Date().toISOString()
            }
          }),
          { status: 200 }
        );
      }
      if (url.includes('/tasks/inbox')) {
        return new Response(
          JSON.stringify({
            data: {
              items: [{ id: 't1', title: 'T', status: 'open', route: '/x' }]
            },
            meta: {
              requestId: 'r2',
              correlationId: 'c2',
              timestamp: new Date().toISOString()
            }
          }),
          { status: 200 }
        );
      }
      if (url.includes('/blockers')) {
        return new Response(
          JSON.stringify({
            data: {
              items: [{ id: 'b1', title: 'B', severity: 'high', route: '/y' }]
            },
            meta: {
              requestId: 'r3',
              correlationId: 'c3',
              timestamp: new Date().toISOString()
            }
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    });

    const dash = await workspaceApi.loadDashboard(session);
    expect(dash.summary.overdueCount).toBe(1);
    expect(dash.tasks).toHaveLength(1);
    expect(dash.blockers).toHaveLength(1);

    fetchMock.mockRestore();
  });
});
