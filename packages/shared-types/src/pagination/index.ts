export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface CursorPaginationQuery {
  cursor?: string;
  limit?: number;
}

export interface ListMeta {
  total: number;
  page?: number;
  pageSize?: number;
  hasNext?: boolean;
  nextCursor?: string;
}
