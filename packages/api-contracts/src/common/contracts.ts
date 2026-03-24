import type { ResponseMeta } from '../meta/contracts';

export interface ApiSuccess<TData> {
  data: TData;
  meta: ResponseMeta;
}
