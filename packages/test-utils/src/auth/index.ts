export const createTestUser = (role = 'admin') => ({
  id: crypto.randomUUID(),
  role,
  email: `${role}.${Date.now()}@example.com`
});

export const authAs = (role: string): string => `Bearer test-${role}-token`;

export const authHeaders = (role = 'admin'): Record<string, string> => ({
  authorization: authAs(role),
  'x-request-id': requestId()
});

export const idempotencyKey = (): string => `idem-${crypto.randomUUID()}`;
export const requestId = (): string => `req-${crypto.randomUUID()}`;
