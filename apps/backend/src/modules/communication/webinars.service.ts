import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type WebinarParticipantRow, type WebinarRow } from './in-memory-webinars.state.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import {
  type AttendanceUpdate,
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
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService,
    @Inject(WebinarProviderResolver) private readonly resolver: WebinarProviderResolver
  ) {}

  async list(tenantId: string, query: WebinarsQuery) {
    return this.repository.list(tenantId, query);
  }

  async create(
    tenantId: string,
    createdBy: string,
    body: Omit<
      WebinarRow,
      | 'id'
      | 'tenantId'
      | 'createdAt'
      | 'updatedAt'
      | 'createdBy'
      | 'status'
      | 'providerCode'
      | 'providerSessionId'
      | 'joinUrl'
      | 'hostUrl'
    >
  ) {
    const now = new Date().toISOString();
    const id = this.id('web');
    const webinar: WebinarRow = {
      ...body,
      id,
      tenantId,
      createdBy,
      status: 'planned',
      createdAt: now,
      updatedAt: now
    };
    // Fail-soft provider wiring: a sleeping/erroring provider never blocks webinar creation.
    try {
      const provider = await this.resolver.forTenant(tenantId);
      const session = await provider.createSession({
        tenantId,
        webinarId: id,
        title: webinar.title,
        plannedStartAt: webinar.plannedStartAt,
        plannedEndAt: webinar.plannedEndAt
      });
      if (session) {
        webinar.providerCode = provider.code;
        webinar.providerSessionId = session.providerSessionId;
        webinar.joinUrl = session.joinUrl;
        webinar.hostUrl = session.hostUrl;
      }
    } catch (err) {
      console.error(`[webinars] createSession failed for ${id} (kept providerless):`, err);
    }
    await this.repository.create(webinar);
    return webinar;
  }

  async get(tenantId: string, id: string) {
    const row = await this.repository.get(tenantId, id);
    if (!row)
      throw new NotFoundException({ code: 'webinar_not_found', message: 'Webinar not found' });
    return row;
  }

  async patch(tenantId: string, id: string, body: Partial<WebinarRow>) {
    const current = await this.get(tenantId, id);
    const row = await this.repository.patch(tenantId, id, {
      ...current,
      ...body,
      updatedAt: new Date().toISOString()
    });
    if (!row)
      throw new NotFoundException({ code: 'webinar_not_found', message: 'Webinar not found' });
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

  /** Learner self-view: webinars where the user is a participant (by learnerId). */
  async listMine(tenantId: string, learnerId: string) {
    const { items } = await this.repository.list(tenantId, { page: 1, pageSize: 200 });
    const mine: WebinarRow[] = [];
    for (const w of items) {
      const { items: parts } = await this.repository.listParticipants(tenantId, w.id, {
        page: 1,
        pageSize: 500
      });
      if (parts.some((p) => p.learnerId === learnerId || p.userId === learnerId)) mine.push(w);
    }
    return mine;
  }

  async recordAttendance(tenantId: string, webinarId: string, update: AttendanceUpdate) {
    await this.repository.upsertParticipantAttendance(tenantId, webinarId, update);
  }

  /**
   * ФТ-F4 (Фаза 5 Task 9): слушатель отмечает посещение при подключении к комнате.
   *
   * Глубокая интеграция с площадкой — [P2], вне фазы: без вебхука факт подключения
   * знает только наша кнопка «Подключиться». Не участник получает «не найдено» —
   * чужой вебинар неотличим от несуществующего (тот же принцип, что в портале).
   * Повтор идемпотентен: joinedAt ставится один раз, точный durationSeconds от
   * вебхука (если придёт) не затирается.
   */
  async joinAsParticipant(tenantId: string, actorRef: string, webinarId: string) {
    const webinar = await this.get(tenantId, webinarId);
    const { items } = await this.repository.listParticipants(tenantId, webinarId, {
      page: 1,
      pageSize: 500
    });
    const me = items.find((p) => p.learnerId === actorRef || p.userId === actorRef);
    if (!me)
      throw new NotFoundException({ code: 'webinar_not_found', message: 'Webinar not found' });
    if (me.attendanceStatus === 'invited') {
      await this.repository.upsertParticipantAttendance(tenantId, webinarId, {
        participantRef: actorRef,
        attendanceStatus: 'joined',
        joinedAt: new Date().toISOString()
      });
    }
    return {
      attendanceStatus: 'joined' as const,
      ...(webinar.joinUrl ? { joinUrl: webinar.joinUrl } : {})
    };
  }

  /**
   * ФТ-F4: секунды посещённых вебинаров по слушателям группы — для журнала часов.
   * Точная длительность от вебхука площадки предпочтительнее плановой; без неё
   * засчитывается плановая длительность вебинара. Неотмеченные не учитываются.
   */
  async groupAttendanceSeconds(tenantId: string, groupId: string): Promise<Map<string, number>> {
    const { items } = await this.repository.list(tenantId, { page: 1, pageSize: 500 });
    const groupWebinars = items.filter((w) => w.groupId === groupId && w.status !== 'cancelled');
    const seconds = new Map<string, number>();
    for (const webinar of groupWebinars) {
      const planned = Math.max(
        0,
        Math.round((Date.parse(webinar.plannedEndAt) - Date.parse(webinar.plannedStartAt)) / 1000)
      );
      const { items: parts } = await this.repository.listParticipants(tenantId, webinar.id, {
        page: 1,
        pageSize: 500
      });
      for (const p of parts) {
        if (p.attendanceStatus === 'invited') continue;
        const key = p.learnerId ?? p.userId;
        if (!key) continue;
        const value = p.durationSeconds ?? planned;
        seconds.set(key, (seconds.get(key) ?? 0) + value);
      }
    }
    return seconds;
  }

  /** Webhook tenant resolution: locate a webinar by its provider session id (cross-tenant). */
  async findByProviderSessionId(providerSessionId: string) {
    return this.repository.findByProviderSessionId(providerSessionId);
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
