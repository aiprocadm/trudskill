import { Injectable } from '@nestjs/common';

import type {
  RecertificationDraftRow,
  RecertificationDraftSeed,
  RecertificationDraftsQuery,
  RecertificationDraftsRepository
} from './recertification-drafts.repository.js';

@Injectable()
export class InMemoryRecertificationDraftsState implements RecertificationDraftsRepository {
  drafts: RecertificationDraftRow[] = [];

  async create(
    seed: RecertificationDraftSeed
  ): Promise<{ row: RecertificationDraftRow; created: boolean }> {
    const existing = this.drafts.find(
      (d) =>
        d.tenantId === seed.tenantId &&
        d.learnerId === seed.learnerId &&
        d.sourceDocumentId === seed.sourceDocumentId
    );
    if (existing) {
      return { row: existing, created: false };
    }
    const now = new Date().toISOString();
    const row: RecertificationDraftRow = {
      id: `recert_${Math.random().toString(36).slice(2, 10)}`,
      tenantId: seed.tenantId,
      learnerId: seed.learnerId,
      sourceDocumentId: seed.sourceDocumentId,
      courseVersionId: seed.courseVersionId,
      validUntil: seed.validUntil,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
    this.drafts.push(row);
    return { row, created: true };
  }

  async list(
    tenantId: string,
    query: RecertificationDraftsQuery
  ): Promise<RecertificationDraftRow[]> {
    return this.drafts.filter(
      (d) => d.tenantId === tenantId && (!query.status || d.status === query.status)
    );
  }

  async getById(tenantId: string, id: string): Promise<RecertificationDraftRow | null> {
    return this.drafts.find((d) => d.tenantId === tenantId && d.id === id) ?? null;
  }

  async markApproved(
    tenantId: string,
    id: string,
    resultingEnrollmentId: string,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const row = await this.getById(tenantId, id);
    if (!row) return null;
    row.status = 'approved';
    row.resultingEnrollmentId = resultingEnrollmentId;
    row.decidedAt = new Date().toISOString();
    if (decidedBy) row.decidedBy = decidedBy;
    row.updatedAt = row.decidedAt;
    return row;
  }

  async markRejected(
    tenantId: string,
    id: string,
    reason: string | undefined,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const row = await this.getById(tenantId, id);
    if (!row) return null;
    row.status = 'rejected';
    if (reason) row.reason = reason;
    row.decidedAt = new Date().toISOString();
    if (decidedBy) row.decidedBy = decidedBy;
    row.updatedAt = row.decidedAt;
    return row;
  }
}
