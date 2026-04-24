import { Injectable, Logger } from '@nestjs/common';
import { type RedisClientType, createClient } from 'redis';

import { realtimeEnv } from './env.js';

export type RealtimeEventName =
  | 'async_task.status_changed'
  | 'notification.created'
  | 'notification.read'
  | 'chat.message.created'
  | 'dialog.updated'
  | 'unread.changed'
  | 'webinar.updated';

export type RealtimeEventEnvelope<TPayload = unknown> = {
  event_name: RealtimeEventName;
  version: 'v1';
  tenant_id: string;
  occurred_at: string;
  correlation_id?: string;
  payload: TPayload;
};

export type RealtimeStreamEvent = {
  cursor: string;
  event: RealtimeEventEnvelope;
};

export interface RealtimePubSub {
  publish(room: string, event: RealtimeEventEnvelope): Promise<void>;
  read(
    room: string,
    options?: { cursor?: string; since?: string; limit?: number }
  ): Promise<RealtimeStreamEvent[]>;
}

export interface RealtimeEventStore {
  persist(room: string, record: RealtimeStreamEvent): Promise<void>;
}

@Injectable()
export class RedisRealtimeEventStore implements RealtimeEventStore {
  async persist(room: string, record: RealtimeStreamEvent): Promise<void> {
    const client = await redisClientProvider.getClient();
    const key = diagnosticsKey(room);
    await client
      .multi()
      .lPush(key, JSON.stringify(record))
      .lTrim(key, 0, realtimeEnv.REALTIME_DIAGNOSTICS_MAX_ITEMS - 1)
      .expire(key, realtimeEnv.REALTIME_DIAGNOSTICS_TTL_SECONDS)
      .exec();
  }
}

@Injectable()
export class RedisStreamsRealtimePubSub implements RealtimePubSub {
  private readonly logger = new Logger(RedisStreamsRealtimePubSub.name);

  constructor(private readonly store: RedisRealtimeEventStore) {}

  async publish(room: string, event: RealtimeEventEnvelope): Promise<void> {
    const client = await redisClientProvider.getClient();
    const streamKey = streamKeyFor(room);
    const cursor = await client.xAdd(streamKey, '*', { event: JSON.stringify(event) });
    await client
      .multi()
      .xTrim(streamKey, 'MAXLEN', realtimeEnv.REALTIME_STREAM_MAXLEN, { strategyModifier: '~' })
      .expire(streamKey, realtimeEnv.REALTIME_STREAM_TTL_SECONDS)
      .exec();
    await this.store.persist(room, { cursor, event });
  }

  async read(
    room: string,
    options?: { cursor?: string; since?: string; limit?: number }
  ): Promise<RealtimeStreamEvent[]> {
    const client = await redisClientProvider.getClient();
    const streamKey = streamKeyFor(room);
    const count = options?.limit ?? realtimeEnv.REALTIME_STREAM_READ_BATCH;
    const entries: Array<{ id: string; message: Record<string, string> }> = options?.cursor
      ? await client.xRange(streamKey, `(${options.cursor}`, '+', { COUNT: count })
      : await client.xRevRange(streamKey, '+', '-', { COUNT: count });

    const mapped = entries
      .map((entry: { id: string; message: Record<string, string> }) => {
        const raw = entry.message.event;
        if (!raw) return null;
        try {
          return {
            cursor: entry.id,
            event: JSON.parse(raw) as RealtimeEventEnvelope
          } satisfies RealtimeStreamEvent;
        } catch (error) {
          this.logger.warn(
            `Failed to parse stream event for room ${room}: ${error instanceof Error ? error.message : 'unknown error'}`
          );
          return null;
        }
      })
      .filter((entry: RealtimeStreamEvent | null): entry is RealtimeStreamEvent => Boolean(entry));

    const ordered = options?.cursor ? mapped : mapped.reverse();
    if (!options?.since) return ordered;
    return ordered.filter((entry: RealtimeStreamEvent) => entry.event.occurred_at > options.since!);
  }
}

class RedisClientProvider {
  private client: RedisClientType | null = null;

  async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({ url: realtimeEnv.REDIS_URL });
      await this.client.connect();
    }

    return this.client;
  }
}

const redisClientProvider = new RedisClientProvider();

function streamKeyFor(room: string): string {
  return `realtime:stream:${room}`;
}

function diagnosticsKey(room: string): string {
  return `realtime:diagnostics:${room}`;
}
