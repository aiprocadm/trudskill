import type { HealthStatus } from '@cdoprof/shared-types';

export interface HealthResponseContract {
  data: HealthStatus;
}

export interface ErrorContract {
  message: string;
  code: string;
}
