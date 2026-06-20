import { Injectable } from '@nestjs/common';

import type {
  AttendanceUpdate,
  WebinarParticipantsQuery,
  WebinarsQuery,
  WebinarsRepository
} from './webinars.repository.js';

export interface WebinarRow {
  id: string;
  tenantId: string;
  groupId?: string;
  courseId?: string;
  title: string;
  description?: string;
  providerCode?: string;
  providerSessionId?: string;
  plannedStartAt: string;
  plannedEndAt: string;
  joinUrl?: string;
  hostUrl?: string;
  status: 'draft' | 'planned' | 'live' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface WebinarParticipantRow {
  webinarId: string;
  tenantId: string;
  userId?: string;
  learnerId?: string;
  roleCode: string;
  attendanceStatus: 'invited' | 'joined' | 'left';
  joinedAt?: string;
  leftAt?: string;
  durationSeconds?: number;
}

@Injectable()
export class InMemoryWebinarsState implements WebinarsRepository {
  webinars: WebinarRow[] = [];
  participants: WebinarParticipantRow[] = [];

  async list(tenantId: string, query: WebinarsQuery = {}) {
    const filtered = this.webinars.filter(
      (item) => item.tenantId === tenantId && (!query.status || item.status === query.status)
    );
    const sorted = [...filtered].sort((a, b) =>
      query.sort === 'updatedAt:asc'
        ? a.updatedAt.localeCompare(b.updatedAt)
        : b.updatedAt.localeCompare(a.updatedAt)
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), total: sorted.length };
  }

  async create(webinar: WebinarRow) {
    this.webinars.push(webinar);
  }

  async get(tenantId: string, id: string) {
    return this.webinars.find((item) => item.id === id && item.tenantId === tenantId) ?? null;
  }

  async patch(tenantId: string, id: string, body: Partial<WebinarRow>) {
    const row = await this.get(tenantId, id);
    if (!row) return null;
    Object.assign(row, body);
    return row;
  }

  async listParticipants(
    tenantId: string,
    webinarId: string,
    query: WebinarParticipantsQuery = {}
  ) {
    const filtered = this.participants.filter(
      (item) => item.tenantId === tenantId && item.webinarId === webinarId
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length };
  }

  async addParticipant(row: WebinarParticipantRow) {
    this.participants.push(row);
  }

  async findByProviderSessionId(providerSessionId: string) {
    return this.webinars.find((w) => w.providerSessionId === providerSessionId) ?? null;
  }

  async upsertParticipantAttendance(tenantId: string, webinarId: string, update: AttendanceUpdate) {
    const existing = this.participants.find(
      (p) =>
        p.tenantId === tenantId &&
        p.webinarId === webinarId &&
        (p.learnerId === update.participantRef || p.userId === update.participantRef)
    );
    if (existing) {
      existing.attendanceStatus = update.attendanceStatus;
      if (update.joinedAt) existing.joinedAt = update.joinedAt;
      if (update.leftAt) existing.leftAt = update.leftAt;
      if (update.durationSeconds !== undefined) existing.durationSeconds = update.durationSeconds;
      return;
    }
    this.participants.push({
      webinarId,
      tenantId,
      learnerId: update.participantRef,
      roleCode: 'attendee',
      attendanceStatus: update.attendanceStatus,
      ...(update.joinedAt ? { joinedAt: update.joinedAt } : {}),
      ...(update.leftAt ? { leftAt: update.leftAt } : {}),
      ...(update.durationSeconds !== undefined ? { durationSeconds: update.durationSeconds } : {})
    });
  }
}
