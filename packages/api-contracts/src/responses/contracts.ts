import type { PaginationMeta, ResponseMeta, SortMeta } from '../meta/contracts';

export interface SuccessResponse<TData, TMeta extends object = object> {
  data: TData;
  meta: ResponseMeta & TMeta;
}

export interface ListResponse<TItem> extends SuccessResponse<TItem[]> {}

export interface PaginatedResponse<TItem>
  extends SuccessResponse<TItem[], { pagination: PaginationMeta; sort?: SortMeta[] }> {}

export interface AsyncTaskResponse
  extends SuccessResponse<{
    task_id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  }> {}

export type ValidationErrorResponse = import('../errors/contracts').ValidationErrorResponse;
export type ForbiddenErrorResponse = import('../errors/contracts').ForbiddenErrorResponse;
export type NotFoundErrorResponse = import('../errors/contracts').NotFoundErrorResponse;
export type ConflictErrorResponse = import('../errors/contracts').ConflictErrorResponse;
export type PreconditionFailedErrorResponse = import('../errors/contracts').PreconditionFailedErrorResponse;
export type RateLimitedErrorResponse = import('../errors/contracts').RateLimitedErrorResponse;
