import type { ResponseMeta } from '../meta/contracts.js';

export interface ApiSuccess<TData> {
  data: TData;
  meta: ResponseMeta;
}
