import type { ISODateString } from '../core/index';

export interface DateRangeFilter {
  from?: ISODateString;
  to?: ISODateString;
}

export interface SearchQuery {
  query?: string;
}
