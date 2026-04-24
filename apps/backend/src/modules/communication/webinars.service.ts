import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type WebinarParticipantRow, type WebinarRow } from './in-memory-webinars.state.js';
import {
  WEBINARS_REPOSITORY,
  type WebinarParticipantsQuery,
  type WebinarsQuery,
  type WebinarsRepository
} from './webinars.repository.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const WEBINAR_UPDATED_EVENT = 'webinar.updated';

@Injectable()
export class WebinarsService {
  constructor(
    @Inject(WEBINARS_REPOSITORY) private readonly repository: WebinarsRepository,
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService
  ) {}

  async list(tenantId: string, query: WebinarsQuery) {
    return this.repository.list(tenantId, query);
  }
  async create(
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
    await this.repository.create(webinar);
    return webinar;
  }
  async get(tenantId: string, id: string) {
    const row = await this.repository.get(tenantId, id);
    if (!row) throw new NotFoundException('Webinar not found');
    return row;
  }
  async patch(tenantId: string, id: string, body: Partial<WebinarRow>) {
    const current = await this.get(tenantId, id);
    const row = await this.repository.patch(tenantId, id, {
      ...current,
      ...body,
      updatedAt: new Date().toISOString()
    });
    if (!row) throw new NotFoundException('Webinar not found');
    this.realtime.publish({
      event_name: WEBINAR_UPDATED_EVENT,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: new Date().toISOString(),
      payload: { webinar_id: id, status: row.status }
    });
    return row;
  }
  async listParticipants(tenantId: string, webinarId: string, query: WebinarParticipantsQuery) {
    await this.get(tenantId, webinarId);
    return this.repository.listParticipants(tenantId, webinarId, query);
  }
  async addParticipant(
    tenantId: string,
    webinarId: string,
    body: Omit<WebinarParticipantRow, 'tenantId' | 'webinarId'>
  ) {
    await this.get(tenantId, webinarId);
    const row: WebinarParticipantRow = { ...body, tenantId, webinarId };
    await this.repository.addParticipant(row);
    return row;
  }
  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
