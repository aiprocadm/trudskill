import { Injectable, Logger } from '@nestjs/common';

import { backendEnv } from '../../env.js';

export interface RealtimeEventEnvelope {
  event_name: string;
  version: string;
  tenant_id: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class RealtimeEventsService {
  private events: RealtimeEventEnvelope[] = [];
  private readonly logger = new Logger(RealtimeEventsService.name);

  publish(event: RealtimeEventEnvelope): void {
    this.events.push(event);
    const roomTargets = this.resolveRooms(event);
    if (backendEnv.NODE_ENV === 'test') {
      return;
    }
    roomTargets.forEach((room) => {
      void fetch(`${backendEnv.REALTIME_PUBLIC_URL}/publish/${room}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-realtime-key': backendEnv.REALTIME_PUBLISH_KEY
        },
        body: JSON.stringify(event)
      }).catch((error: unknown) => {
        const errorName = error instanceof Error ? error.name : 'unknown';
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Realtime publish failed: event=${event.event_name} room=${room} error=${errorName}: ${errorMessage}`
        );
        return undefined;
      });
    });
  }

  list(tenantId: string, since?: string): RealtimeEventEnvelope[] {
    return this.events.filter(
      (event) => event.tenant_id === tenantId && (!since || event.occurred_at > since)
    );
  }

  private resolveRooms(event: RealtimeEventEnvelope): string[] {
    const rooms = [`tenant:${event.tenant_id}`];
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload.recipient_user_id === 'string')
      rooms.push(`user:${payload.recipient_user_id}`);
    if (typeof payload.task_id === 'string')
      rooms.push(`task:${event.tenant_id}:${payload.task_id}`);
    if (typeof payload.dialog_id === 'string')
      rooms.push(`dialog:${event.tenant_id}:${payload.dialog_id}`);
    if (typeof payload.webinar_id === 'string')
      rooms.push(`webinar:${event.tenant_id}:${payload.webinar_id}`);
    return rooms;
  }
}
