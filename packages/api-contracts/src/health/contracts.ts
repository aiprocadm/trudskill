import type { HealthStatus } from '@cdoprof/shared-types';

import type { ApiError, ApiSuccess } from '../common/contracts';

export type HealthResponseContract = ApiSuccess<HealthStatus>;
export type HealthErrorContract = ApiError;
