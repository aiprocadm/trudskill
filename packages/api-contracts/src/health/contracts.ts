import type { HealthStatus } from '@cdoprof/shared-types';

import type { ApiErrorResponse } from '../errors/contracts';
import type { ApiSuccess } from '../common/contracts';

export type HealthResponseContract = ApiSuccess<HealthStatus>;
export type HealthErrorContract = ApiErrorResponse;
