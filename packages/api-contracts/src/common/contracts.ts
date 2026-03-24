export interface ApiSuccess<TData> {
  data: TData;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}
