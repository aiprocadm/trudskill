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

/** Состав комиссии учебного центра (п. 5.1, 5.15 ТЗ); расширяется по мере внедрения БД. */
export interface CommissionMember {
  id: string;
  tenantId: string;
  displayName: string;
  position?: string;
  userId?: string;
}

export interface TenantCommission {
  tenantId: string;
  chairMemberId?: string;
  secretaryMemberId?: string;
  members: CommissionMember[];
}
