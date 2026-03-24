import type { HealthStatus } from '../../../shared-types/src/index.ts';

import type { ApiErrorResponse } from '../errors/contracts';
import type { ApiSuccess } from '../common/contracts';

export type HealthResponseContract = ApiSuccess<HealthStatus>;
export type HealthErrorContract = ApiErrorResponse;
