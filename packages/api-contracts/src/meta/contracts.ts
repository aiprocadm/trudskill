export interface ResponseMeta {
  request_id: string;
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
  next_cursor?: string;
}

export interface SortMeta {
  field: string;
  order: 'asc' | 'desc';
}
