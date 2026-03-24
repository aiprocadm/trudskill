export type UUID = string;
export type ISODateString = string;

export type EntityStatus = 'active' | 'inactive' | 'archived';

export interface WithId {
  id: UUID;
}

export interface TenantAware {
  tenantId: UUID;
}

export interface Auditable {
  createdAt: ISODateString;
  createdBy: UUID;
  updatedAt: ISODateString;
  updatedBy: UUID;
}

export type BaseEntity = WithId & TenantAware & Auditable;

export interface PaginatedResult<TItem> {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HealthStatus {
  status: 'ok';
  timestamp: ISODateString;
  service: 'frontend' | 'backend' | 'worker' | 'realtime';
}
