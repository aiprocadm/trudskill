import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

/**
 * Serializes async work per tenant (MVP/documents request persistence, reminder scans, etc.).
 * REENTRANT per tenant: if the current async execution already holds tenant T's critical section,
 * a nested runExclusive(T) runs inline instead of deadlocking on the chain it is already inside.
 * (Without this, a documents-runner call nested inside an MVP-runner/interceptor section for the
 * same tenant would await the very promise it is part of — a circular wait.)
 */
@Injectable()
export class TenantSerialGateway {
  private readonly chains = new Map<string, Promise<unknown>>();
  /** Tenants whose critical section the current async execution already holds. */
  private readonly heldTenants = new AsyncLocalStorage<Set<string>>();

  async runExclusive<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const held = this.heldTenants.getStore();
    if (held?.has(tenantId)) {
      // Reentrant: this async execution already owns tenantId's lock — run inline.
      return fn();
    }

    const nextHeld = new Set(held ?? []);
    nextHeld.add(tenantId);

    const prev = this.chains.get(tenantId) ?? Promise.resolve();
    const current = prev.then(() => this.heldTenants.run(nextHeld, fn));
    this.chains.set(
      tenantId,
      current.then(
        () => undefined,
        () => undefined
      )
    );
    await prev;
    return current;
  }
}
