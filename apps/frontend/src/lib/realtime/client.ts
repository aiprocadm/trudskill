'use client';

import { frontendEnv } from '../config/env';
import type { RealtimeEventEnvelope } from '@cdoprof/api-contracts';

export type RealtimeHandler = (event: RealtimeEventEnvelope) => void;

export class RealtimeClient {
  private sources = new Map<string, EventSource>();

  subscribe(room: string, token: string, handler: RealtimeHandler) {
    const url = `${frontendEnv.NEXT_PUBLIC_REALTIME_URL}/stream/${room}?since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`;
    const source = new EventSource(url, { withCredentials: false });
    source.onmessage = (message) => {
      try {
        handler(JSON.parse(message.data) as RealtimeEventEnvelope);
      } catch {
        // no-op
      }
    };
    source.onerror = () => {
      source.close();
      setTimeout(() => this.subscribe(room, token, handler), 2_000);
    };
    this.sources.set(`${room}:${token}`, source);
    return () => {
      source.close();
      this.sources.delete(`${room}:${token}`);
    };
  }
}

export const realtimeClient = new RealtimeClient();
