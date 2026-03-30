export type Brand<T, TBrand extends string> = T & {
    readonly __brand: TBrand;
};
export type UUID = Brand<string, 'UUID'>;
export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type EntityId = Brand<string, 'EntityId'>;
export type RequestId = Brand<string, 'RequestId'>;
export declare const asTenantId: (value: string) => TenantId;
export declare const asUserId: (value: string) => UserId;
export declare const asRequestId: (value: string) => RequestId;
//# sourceMappingURL=index.d.ts.map