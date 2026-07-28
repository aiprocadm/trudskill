import type { ISODateString } from '../core/index.js';

export interface DateRangeFilter {
  from?: ISODateString;
  to?: ISODateString;
}

export interface SearchQuery {
  query?: string;
}
