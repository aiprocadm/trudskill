import { Injectable, Logger } from '@nestjs/common';

import { resolveRealtimeRooms } from './realtime-rooms.js';
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

  /**
   * Порция 36 (журнал 282): правило «у кого есть адресат — тому и уходит» вынесено
   * чистой функцией и покрыто тестами. Раньше КАЖДОЕ событие дублировалось в общую
   * комнату центра, куда пускают любого вошедшего.
   */
  private resolveRooms(event: RealtimeEventEnvelope): string[] {
    return resolveRealtimeRooms(event);
  }
}
