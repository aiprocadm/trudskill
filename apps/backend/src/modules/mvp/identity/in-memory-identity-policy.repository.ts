import { randomUUID } from 'node:crypto';

import type { IdentityPolicyScope } from './identity-policy.js';
import type {
  IdentityPolicyRepository,
  IdentityPolicyRow,
  SaveIdentityPolicyInput
} from './identity-policy.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) и юнит-тесты сервиса. */
export class InMemoryIdentityPolicyRepository implements IdentityPolicyRepository {
  private readonly rows = new Map<string, IdentityPolicyRow>();

  private key(tenantId: string, scope: IdentityPolicyScope, scopeId?: string): string {
    return `${tenantId}::${scope}::${scopeId ?? ''}`;
  }

  async list(tenantId: string): Promise<IdentityPolicyRow[]> {
    return [...this.rows.values()].filter((row) => row.tenantId === tenantId);
  }

  async save(tenantId: string, input: SaveIdentityPolicyInput): Promise<IdentityPolicyRow> {
    const key = this.key(tenantId, input.scope, input.scopeId);
    const row: IdentityPolicyRow = {
      id: this.rows.get(key)?.id ?? `ipol_${randomUUID()}`,
      tenantId,
      scope: input.scope,
      level: input.level,
      requirePhotoBeforeExam: input.requirePhotoBeforeExam,
      updatedAt: new Date().toISOString(),
      ...(input.scopeId ? { scopeId: input.scopeId } : {})
    };
    this.rows.set(key, row);
    return row;
  }

  async remove(tenantId: string, scope: IdentityPolicyScope, scopeId?: string): Promise<boolean> {
    return this.rows.delete(this.key(tenantId, scope, scopeId));
  }
}
