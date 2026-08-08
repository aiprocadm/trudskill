import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeClient } from './client';

import type { RealtimeEventEnvelope } from '@trudskill/api-contracts';

/**
 * Фаза 6, дефект A: шторм живых обновлений.
 *
 * Экран перерисовывается на каждое событие, на перерисовке пересоздавался колбэк,
 * из-за колбэка эффект переподписывался, а каждое новое подключение просило у
 * realtime повтор событий за последние 60 секунд — те же события приезжали снова
 * и круг замыкался. Тесты закрывают все три звена круга.
 */

interface FakeMessage {
  data: string;
  lastEventId?: string;
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onmessage: ((message: FakeMessage) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  /** Сервер прислал событие с SSE-идентификатором (`id:` в потоке). */
  emit(event: RealtimeEventEnvelope, lastEventId?: string) {
    this.onmessage?.({
      data: JSON.stringify(event),
      ...(lastEventId ? { lastEventId } : {})
    });
  }

  /** Обрыв соединения. */
  fail() {
    this.readyState = 2;
    this.onerror?.();
  }
}

const event = (name = 'notification.created'): RealtimeEventEnvelope =>
  ({
    event_name: name,
    version: 'v1',
    tenant_id: 'tenant_demo',
    occurred_at: '2026-08-08T10:00:00.000Z',
    payload: {}
  }) as RealtimeEventEnvelope;

const lastUrl = () => new URL(FakeEventSource.instances.at(-1)!.url);

describe('RealtimeClient: подписка не должна штормить (Фаза 6, дефект A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('первое подключение к комнате просит окно догона за последнюю минуту', () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});

    expect(FakeEventSource.instances).toHaveLength(1);
    const url = lastUrl();
    expect(url.pathname).toBe('/stream/user%3Au1');
    expect(url.searchParams.get('access_token')).toBe('token-1');
    expect(url.searchParams.get('since')).toBeTruthy();
  });

  it('на одну комнату с одним токеном держится одно соединение на всех подписчиков', () => {
    const client = new RealtimeClient();
    const first = vi.fn();
    const second = vi.fn();

    const offFirst = client.subscribe('user:u1', 'token-1', first);
    client.subscribe('user:u1', 'token-1', second);

    expect(FakeEventSource.instances).toHaveLength(1);

    FakeEventSource.instances[0]!.emit(event());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // Ушёл один подписчик — соединение нужно второму, закрывать нельзя.
    offFirst();
    expect(FakeEventSource.instances[0]!.closed).toBe(false);
  });

  it('перерисовки экрана не пересоздают соединение и не повторяют события', () => {
    const client = new RealtimeClient();
    let off = client.subscribe('user:u1', 'token-1', () => {});

    // Двадцать перерисовок: React снимает эффект и тут же ставит его заново.
    for (let i = 0; i < 20; i += 1) {
      off();
      off = client.subscribe('user:u1', 'token-1', () => {});
    }

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.closed).toBe(false);
  });

  it('уход последнего подписчика закрывает соединение', () => {
    const client = new RealtimeClient();
    const off = client.subscribe('user:u1', 'token-1', () => {});

    off();
    vi.advanceTimersByTime(30_000);

    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });

  it('отписка отменяет отложенное переподключение', () => {
    const client = new RealtimeClient();
    const off = client.subscribe('user:u1', 'token-1', () => {});

    FakeEventSource.instances[0]!.fail();
    off();
    vi.advanceTimersByTime(120_000);

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('переподключение продолжает с последнего события, а не повторяет минуту заново', () => {
    const client = new RealtimeClient();
    const handler = vi.fn();
    client.subscribe('user:u1', 'token-1', handler);

    FakeEventSource.instances[0]!.emit(event(), '1712-0');
    FakeEventSource.instances[0]!.fail();
    vi.advanceTimersByTime(2_000);

    expect(FakeEventSource.instances).toHaveLength(2);
    const url = lastUrl();
    expect(url.searchParams.get('cursor')).toBe('1712-0');
    expect(url.searchParams.get('since')).toBeNull();
  });

  it('повторные обрывы разводятся по времени, а не долбят сервер каждые две секунды', () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});

    FakeEventSource.instances[0]!.fail();
    vi.advanceTimersByTime(2_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[1]!.fail();
    vi.advanceTimersByTime(2_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    vi.advanceTimersByTime(2_000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('успешное подключение сбрасывает разведение по времени', () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});

    FakeEventSource.instances[0]!.fail();
    vi.advanceTimersByTime(2_000);
    FakeEventSource.instances[1]!.onopen?.();

    FakeEventSource.instances[1]!.fail();
    vi.advanceTimersByTime(2_000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('разные комнаты и разные токены живут отдельными соединениями', () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    client.subscribe('dialog:t1:d1', 'token-1', () => {});
    client.subscribe('user:u1', 'token-2', () => {});

    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('битое событие не роняет подписку и не приезжает снова после переподключения', () => {
    const client = new RealtimeClient();
    const handler = vi.fn();
    client.subscribe('user:u1', 'token-1', handler);

    const source = FakeEventSource.instances[0]!;
    source.onmessage?.({ data: 'не-json', lastEventId: '99-0' });
    expect(handler).not.toHaveBeenCalled();

    source.emit(event());
    expect(handler).toHaveBeenCalledTimes(1);

    source.fail();
    vi.advanceTimersByTime(2_000);
    expect(lastUrl().searchParams.get('cursor')).toBe('99-0');
  });

  it('повторный вызов функции отписки не закрывает чужое соединение', () => {
    const client = new RealtimeClient();
    const offFirst = client.subscribe('user:u1', 'token-1', () => {});
    client.subscribe('user:u1', 'token-1', () => {});

    offFirst();
    offFirst();
    vi.advanceTimersByTime(30_000);

    expect(FakeEventSource.instances[0]!.closed).toBe(false);
  });
});
