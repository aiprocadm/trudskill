import type { ApiSuccess } from '../common/contracts';
import type { ApiErrorResponse } from '../errors/contracts';
import type { HealthStatus } from '@cdoprof/shared-types';


export type HealthResponseContract = ApiSuccess<HealthStatus>;
export type HealthErrorContract = ApiErrorResponse;
