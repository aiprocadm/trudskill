import { describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../entities/session/model';
import { mvpApi } from './api';

const apiRequestMock = vi.fn();

vi.mock('../../lib/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args)
}));

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'demo',
    email: 'demo@example.com',
    displayName: 'Demo',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['courses.read']
};

describe('mvp api query composition', () => {
  it('uses direction_id for course filters and skips empty params', async () => {
    apiRequestMock.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 });

    await mvpApi.listCourses(session, { q: 'ts', direction_id: 'd1', status: '', page: 1 });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/courses?q=ts&direction_id=d1&page=1',
      expect.objectContaining({ auth: expect.objectContaining({ tenantId: 'tenant_demo' }) })
    );
  });

  it('sends learner_id in learner courses query', async () => {
    apiRequestMock.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 });

    await mvpApi.listEnrollments(session, { learner_id: 'learner-1' });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/enrollments?learner_id=learner-1',
      expect.objectContaining({ auth: expect.objectContaining({ userId: 'u1' }) })
    );
  });
});
