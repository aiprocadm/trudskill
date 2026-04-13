import { Injectable } from '@nestjs/common';

/** Serializes async work per tenant (MVP/documents request persistence, etc.). */
@Injectable()
export class TenantSerialGateway {
  private readonly chains = new Map<string, Promise<unknown>>();

  async runExclusive<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(tenantId) ?? Promise.resolve();
    const current = prev.then(() => fn());
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
