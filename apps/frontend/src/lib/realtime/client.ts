'use client';

import { frontendEnv } from '../config/env';

import type { RealtimeEventEnvelope } from '@cdoprof/api-contracts';

export type RealtimeHandler = (event: RealtimeEventEnvelope) => void;

export class RealtimeClient {
  private sources = new Map<string, EventSource>();

  subscribe(room: string, token: string, handler: RealtimeHandler) {
    // EventSource не поддерживает Authorization; тот же access JWT передаётся в query (как договорено с realtime).
    const base = frontendEnv.NEXT_PUBLIC_REALTIME_URL.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
    const url = new URL(`${base.replace(/\/$/, '')}/stream/${encodeURIComponent(room)}`);
    url.searchParams.set('since', new Date(Date.now() - 60_000).toISOString());
    if (token) url.searchParams.set('access_token', token);
    const source = new EventSource(url.toString(), { withCredentials: false });
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
