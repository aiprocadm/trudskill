export interface ResponseMeta {
  request_id: string;
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
}

export interface SortMeta {
  field: string;
  order: 'asc' | 'desc';
}
