import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/** Empty query results for workspace unit/integration tests. */
export const workspaceTestDatabaseStub = {
  query: async () => [],
  withTransaction: async <T>(cb: (client: unknown) => Promise<T>) => cb({})
} as unknown as DatabaseService;
