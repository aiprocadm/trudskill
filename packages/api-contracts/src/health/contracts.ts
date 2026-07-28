import type { ApiSuccess } from '../common/contracts.js';
import type { ApiErrorResponse } from '../errors/contracts.js';
import type { HealthStatus } from '@trudskill/shared-types';

export type HealthResponseContract = ApiSuccess<HealthStatus>;
export type HealthErrorContract = ApiErrorResponse;
