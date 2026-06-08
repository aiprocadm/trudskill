import { Injectable } from '@nestjs/common';

import type {
  EmailDeliveriesQuery,
  EmailDeliveriesRepository,
  EmailDeliveryRow,
  EmailDeliverySeed
} from './email-deliveries.repository.js';

@Injectable()
export class InMemoryEmailDeliveriesState implements EmailDeliveriesRepository {
  deliveries: EmailDeliveryRow[] = [];

  async record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow> {
    const row: EmailDeliveryRow = {
      ...seed,
      id: `emaildlv_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString()
    };
    this.deliveries.unshift(row);
    return row;
  }

  async list(
    tenantId: string,
    query: EmailDeliveriesQuery = {}
  ): Promise<{ items: EmailDeliveryRow[]; total: number }> {
    const all = this.deliveries.filter((d) => d.tenantId === tenantId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return { items, total: all.length };
  }

  async findByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow | null> {
    return this.deliveries.find((d) => d.tenantId === tenantId && d.dedupKey === dedupKey) ?? null;
  }
}
