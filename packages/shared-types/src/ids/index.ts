export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type UUID = Brand<string, 'UUID'>;
export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type EntityId = Brand<string, 'EntityId'>;
export type RequestId = Brand<string, 'RequestId'>;

export const asTenantId = (value: string): TenantId => value as TenantId;
export const asUserId = (value: string): UserId => value as UserId;
export const asRequestId = (value: string): RequestId => value as RequestId;
