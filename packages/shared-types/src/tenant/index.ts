import type { ISODateString } from '../core/index';
import type { TenantId, UserId } from '../ids/index';

export interface ActorRef {
  id: UserId;
  type: 'user' | 'service';
}

export interface AuditMeta {
  createdAt: ISODateString;
  createdBy: ActorRef;
  updatedAt: ISODateString;
  updatedBy: ActorRef;
}

export interface TenantScopedEntity {
  id: string;
  tenantId: TenantId;
}

export type WithTenant<T> = T & { tenantId: TenantId };

export const isSameTenant = (actorTenant: TenantId, resourceTenant: TenantId): boolean =>
  actorTenant === resourceTenant;
