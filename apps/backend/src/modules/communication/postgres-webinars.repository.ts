import { Injectable } from '@nestjs/common';

import { type DatabaseService } from '../../infrastructure/database/database.service.js';

import type { WebinarParticipantRow, WebinarRow } from './in-memory-webinars.state.js';
import type {
  WebinarParticipantsQuery,
  WebinarsQuery,
  WebinarsRepository
} from './webinars.repository.js';

@Injectable()
export class PostgresWebinarsRepository implements WebinarsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string, query: WebinarsQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const rows = await this.db.query<{
      id: string;
      tenant_id: string;
      group_id: string | null;
      course_id: string | null;
      title: string;
      description: string | null;
      provider_code: string | null;
      provider_session_id: string | null;
      planned_start_at: string;
      planned_end_at: string;
      join_url: string | null;
      host_url: string | null;
      status: WebinarRow['status'];
      created_by: string;
      created_at: string;
      updated_at: string;
      total_count: string;
    }>(
      `select id, tenant_id, group_id, course_id, title, description, provider_code, provider_session_id,
              planned_start_at, planned_end_at, join_url, host_url, status, created_by, created_at, updated_at,
              count(*) over()::text as total_count
       from communication.webinars
       where tenant_id = $1 and ($2::text is null or status = $2)
       order by updated_at ${query.sort === 'updatedAt:asc' ? 'asc' : 'desc'}
       limit $3 offset $4`,
      [tenantId, query.status ?? null, pageSize, offset]
    );
    return { items: rows.map((row) => this.map(row)), total: Number(rows[0]?.total_count ?? 0) };
  }

  async create(webinar: WebinarRow) {
    await this.db.query(
      `insert into communication.webinars
       (id, tenant_id, group_id, course_id, title, description, provider_code, provider_session_id,
        planned_start_at, planned_end_at, join_url, host_url, status, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,$15::timestamptz,$16::timestamptz)`,
      [
        webinar.id,
        webinar.tenantId,
        webinar.groupId ?? null,
        webinar.courseId ?? null,
        webinar.title,
        webinar.description ?? null,
        webinar.providerCode ?? null,
        webinar.providerSessionId ?? null,
        webinar.plannedStartAt,
        webinar.plannedEndAt,
        webinar.joinUrl ?? null,
        webinar.hostUrl ?? null,
        webinar.status,
        webinar.createdBy,
        webinar.createdAt,
        webinar.updatedAt
      ]
    );
  }

  async get(tenantId: string, id: string) {
    const rows = await this.db.query<any>(
      'select * from communication.webinars where tenant_id = $1 and id = $2',
      [tenantId, id]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async patch(tenantId: string, id: string, body: Partial<WebinarRow>) {
    const next = await this.get(tenantId, id);
    if (!next) return null;
    Object.assign(next, body);
    await this.db.query(
      `update communication.webinars set
       title = $1, description = $2, provider_code = $3, provider_session_id = $4,
       planned_start_at = $5::timestamptz, planned_end_at = $6::timestamptz,
       join_url = $7, host_url = $8, status = $9, updated_at = $10::timestamptz
       where tenant_id = $11 and id = $12`,
      [
        next.title,
        next.description ?? null,
        next.providerCode ?? null,
        next.providerSessionId ?? null,
        next.plannedStartAt,
        next.plannedEndAt,
        next.joinUrl ?? null,
        next.hostUrl ?? null,
        next.status,
        next.updatedAt,
        tenantId,
        id
      ]
    );
    return next;
  }

  async listParticipants(
    tenantId: string,
    webinarId: string,
    query: WebinarParticipantsQuery = {}
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const rows = await this.db.query<{
      webinar_id: string;
      tenant_id: string;
      user_id: string | null;
      learner_id: string | null;
      role_code: string;
      attendance_status: WebinarParticipantRow['attendanceStatus'];
      joined_at: string | null;
      left_at: string | null;
      duration_seconds: number | null;
      total_count: string;
    }>(
      `select webinar_id, tenant_id, user_id, learner_id, role_code, attendance_status, joined_at, left_at, duration_seconds,
              count(*) over()::text as total_count
       from communication.webinar_participants
       where tenant_id = $1 and webinar_id = $2
       order by created_at desc
       limit $3 offset $4`,
      [tenantId, webinarId, pageSize, offset]
    );
    return {
      items: rows.map((row) => ({
        webinarId: row.webinar_id,
        tenantId: row.tenant_id,
        userId: row.user_id ?? undefined,
        learnerId: row.learner_id ?? undefined,
        roleCode: row.role_code,
        attendanceStatus: row.attendance_status,
        joinedAt: row.joined_at ?? undefined,
        leftAt: row.left_at ?? undefined,
        durationSeconds: row.duration_seconds ?? undefined
      })),
      total: Number(rows[0]?.total_count ?? 0)
    };
  }

  async addParticipant(row: WebinarParticipantRow) {
    await this.db.query(
      `insert into communication.webinar_participants
       (id, tenant_id, webinar_id, user_id, learner_id, role_code, attendance_status, joined_at, left_at, duration_seconds)
       values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10)`,
      [
        `wp_${Math.random().toString(36).slice(2, 10)}`,
        row.tenantId,
        row.webinarId,
        row.userId ?? null,
        row.learnerId ?? null,
        row.roleCode,
        row.attendanceStatus,
        row.joinedAt ?? null,
        row.leftAt ?? null,
        row.durationSeconds ?? null
      ]
    );
  }

  private map(row: any): WebinarRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      groupId: row.group_id ?? undefined,
      courseId: row.course_id ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      providerCode: row.provider_code ?? undefined,
      providerSessionId: row.provider_session_id ?? undefined,
      plannedStartAt: row.planned_start_at,
      plannedEndAt: row.planned_end_at,
      joinUrl: row.join_url ?? undefined,
      hostUrl: row.host_url ?? undefined,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
