export interface Tenant {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'suspended';
}

export interface TenantSettings {
  tenantId: string;
  locale: string;
  timezone: string;
  payload: Record<string, unknown>;
}

export interface TenantRequisites {
  tenantId: string;
  legalName: string;
  taxNumber: string;
  payload: Record<string, unknown>;
}
