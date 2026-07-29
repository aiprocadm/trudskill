import type { IdentityPolicyRecord, IdentityPolicyScope } from './identity-policy.js';

export const IDENTITY_POLICY_REPOSITORY = Symbol('IDENTITY_POLICY_REPOSITORY');

export interface IdentityPolicyRow extends IdentityPolicyRecord {
  id: string;
  tenantId: string;
  updatedAt: string;
}

export interface SaveIdentityPolicyInput {
  scope: IdentityPolicyScope;
  scopeId?: string | undefined;
  level: number;
  requirePhotoBeforeExam: boolean;
}

export interface IdentityPolicyRepository {
  list(tenantId: string): Promise<IdentityPolicyRow[]>;
  save(tenantId: string, input: SaveIdentityPolicyInput): Promise<IdentityPolicyRow>;
  remove(tenantId: string, scope: IdentityPolicyScope, scopeId?: string): Promise<boolean>;
}
