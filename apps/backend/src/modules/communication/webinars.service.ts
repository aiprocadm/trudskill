import { Injectable, NotFoundException } from '@nestjs/common';

import { type RealtimeEventsService } from '../core/realtime-events.service.js';

const WEBINAR_UPDATED_EVENT = 'webinar.updated';

interface Webinar {
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
interface WebinarParticipant {
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
export class WebinarsService {
  private webinars: Webinar[] = [];
  private participants: WebinarParticipant[] = [];

  constructor(private readonly realtime: RealtimeEventsService) {}

  list(tenantId: string) {
    return this.webinars.filter((item) => item.tenantId === tenantId);
  }
  create(
    tenantId: string,
    createdBy: string,
    body: Omit<Webinar, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>
  ) {
    const webinar: Webinar = {
      ...body,
      id: this.id('web'),
      tenantId,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.webinars.push(webinar);
    return webinar;
  }
  get(tenantId: string, id: string) {
    const row = this.webinars.find((item) => item.id === id && item.tenantId === tenantId);
    if (!row) throw new NotFoundException('Webinar not found');
    return row;
  }
  patch(tenantId: string, id: string, body: Partial<Webinar>) {
    const row = this.get(tenantId, id);
    Object.assign(row, body, { updatedAt: new Date().toISOString() });
    this.realtime.publish({
      event_name: WEBINAR_UPDATED_EVENT,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: new Date().toISOString(),
      payload: { webinar_id: id, status: row.status }
    });
    return row;
  }
  listParticipants(tenantId: string, webinarId: string) {
    this.get(tenantId, webinarId);
    return this.participants.filter(
      (item) => item.tenantId === tenantId && item.webinarId === webinarId
    );
  }
  addParticipant(
    tenantId: string,
    webinarId: string,
    body: Omit<WebinarParticipant, 'tenantId' | 'webinarId'>
  ) {
    this.get(tenantId, webinarId);
    const row: WebinarParticipant = { ...body, tenantId, webinarId };
    this.participants.push(row);
    return row;
  }
  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
