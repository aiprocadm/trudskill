import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  InMemoryWebinarsState,
  type WebinarParticipantRow,
  type WebinarRow
} from './in-memory-webinars.state.js';
import { WEBINARS_STATE } from './webinars-state.token.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const WEBINAR_UPDATED_EVENT = 'webinar.updated';

@Injectable()
export class WebinarsService {
  constructor(
    @Inject(WEBINARS_STATE) private readonly state: InMemoryWebinarsState,
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService
  ) {}

  list(tenantId: string) {
    return this.state.webinars.filter((item) => item.tenantId === tenantId);
  }
  create(
    tenantId: string,
    createdBy: string,
    body: Omit<WebinarRow, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'createdBy'>
  ) {
    const webinar: WebinarRow = {
      ...body,
      id: this.id('web'),
      tenantId,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.state.webinars.push(webinar);
    return webinar;
  }
  get(tenantId: string, id: string) {
    const row = this.state.webinars.find((item) => item.id === id && item.tenantId === tenantId);
    if (!row) throw new NotFoundException('Webinar not found');
    return row;
  }
  patch(tenantId: string, id: string, body: Partial<WebinarRow>) {
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
    return this.state.participants.filter(
      (item) => item.tenantId === tenantId && item.webinarId === webinarId
    );
  }
  addParticipant(
    tenantId: string,
    webinarId: string,
    body: Omit<WebinarParticipantRow, 'tenantId' | 'webinarId'>
  ) {
    this.get(tenantId, webinarId);
    const row: WebinarParticipantRow = { ...body, tenantId, webinarId };
    this.state.participants.push(row);
    return row;
  }
  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
