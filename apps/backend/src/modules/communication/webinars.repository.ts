import type { WebinarParticipantRow, WebinarRow } from './in-memory-webinars.state.js';

export const WEBINARS_REPOSITORY = Symbol('WEBINARS_REPOSITORY');

export interface WebinarsQuery {
  page?: number;
  pageSize?: number;
  status?: WebinarRow['status'];
  sort?: 'updatedAt:asc' | 'updatedAt:desc';
}

export interface WebinarParticipantsQuery {
  page?: number;
  pageSize?: number;
}

export interface WebinarsRepository {
  list(tenantId: string, query: WebinarsQuery): Promise<{ items: WebinarRow[]; total: number }>;
  create(webinar: WebinarRow): Promise<void>;
  get(tenantId: string, id: string): Promise<WebinarRow | null>;
  patch(tenantId: string, id: string, body: Partial<WebinarRow>): Promise<WebinarRow | null>;
  listParticipants(
    tenantId: string,
    webinarId: string,
    query: WebinarParticipantsQuery
  ): Promise<{ items: WebinarParticipantRow[]; total: number }>;
  addParticipant(row: WebinarParticipantRow): Promise<void>;
}
