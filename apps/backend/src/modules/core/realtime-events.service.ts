import { Injectable } from '@nestjs/common';
import type { RealtimeEventEnvelope } from '@cdoprof/api-contracts';
import { backendEnv } from '../../env.js';

@Injectable()
export class RealtimeEventsService {
  private events: RealtimeEventEnvelope[] = [];

  publish(event: RealtimeEventEnvelope): void {
    this.events.push(event);
    const roomTargets = this.resolveRooms(event);
    roomTargets.forEach((room) => {
      void fetch(`${backendEnv.REALTIME_PUBLIC_URL}/publish/${room}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-realtime-key': 'dev-realtime-key' },
        body: JSON.stringify(event)
      }).catch(() => undefined);
    });
  }

  list(tenantId: string, since?: string): RealtimeEventEnvelope[] {
    return this.events.filter((event) => event.tenant_id === tenantId && (!since || event.occurred_at > since));
  }

  private resolveRooms(event: RealtimeEventEnvelope): string[] {
    const rooms = [`tenant:${event.tenant_id}`];
    const payload = event.payload as Record<string, unknown>;
    if (typeof payload.recipient_user_id === 'string') rooms.push(`user:${payload.recipient_user_id}`);
    if (typeof payload.task_id === 'string') rooms.push(`task:${payload.task_id}`);
    if (typeof payload.dialog_id === 'string') rooms.push(`dialog:${payload.dialog_id}`);
    if (typeof payload.webinar_id === 'string') rooms.push(`webinar:${payload.webinar_id}`);
    return rooms;
  }
}
