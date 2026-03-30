import type { TenantId } from '../ids/index';
export interface TenantContext {
    tenantId: TenantId;
    role: string;
}
export declare const tenantGuard: <T extends {
    tenantId: TenantId;
}>(context: TenantContext, entity: T) => T | null;
//# sourceMappingURL=index.d.ts.map