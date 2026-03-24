import type { HealthStatus } from '@cdoprof/shared-types';

export const createHealthFixture = (
  service: HealthStatus['service'] = 'backend'
): HealthStatus => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  service
});
