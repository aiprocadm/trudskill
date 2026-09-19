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
 *
 * **ТЗ 9.1: подключение стало асинхронным.** Раньше в адрес потока клали полный токен доступа,
 * и соединение открывалось сразу. Теперь сперва запрашивается одноразовый тикет, и только он
 * уходит в адрес (журнал 571). Утверждения тестов не изменились — изменилось то, что между
 * подпиской и открытием соединения появился один шаг ожидания.
 */

/** Сколько тикетов выдано: каждое подключение обязано брать СВОЙ — прежний уже сгорел. */
let issuedTickets = 0;

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(async () => {
    issuedTickets += 1;
    return { ticket: `ticket-${issuedTickets}`, expiresInSeconds: 30 };
  })
}));

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

/**
 * Дать походу за тикетом завершиться.
 *
 * Поддельные таймеры не прогоняют микрозадачи, а подключение теперь начинается с запроса
 * тикета. Без этой паузы соединение «ещё не открылось» и тесты мерили бы пустоту.
 */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

/** Сдвинуть время и дождаться, пока отложенное подключение действительно откроется. */
const advance = async (ms: number) => {
  vi.advanceTimersByTime(ms);
  await settle();
};

describe('RealtimeClient: подписка не должна штормить (Фаза 6, дефект A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    issuedTickets = 0;
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('первое подключение к комнате просит окно догона за последнюю минуту', async () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    expect(FakeEventSource.instances).toHaveLength(1);
    const url = lastUrl();
    expect(url.pathname).toBe('/stream/user%3Au1');
    expect(url.searchParams.get('since')).toBeTruthy();
  });

  it('в адрес уходит одноразовый тикет, а не токен доступа (ТЗ 9.1)', async () => {
    /*
     * Адрес запроса не секрет: он оседает в журналах веб-сервера, в истории браузера и в
     * заголовке `Referer`, который уходит на чужие сайты. Полный токен доступа оттуда можно
     * взять и работать от имени человека (журнал 571).
     */
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    const url = lastUrl();
    expect(url.searchParams.get('ticket')).toBe('ticket-1');
    expect(url.searchParams.get('access_token'), 'токен доступа в адресе').toBeNull();
    expect(url.toString(), 'токен просочился в адрес другим путём').not.toContain('token-1');
  });

  it('каждое подключение берёт СВОЙ тикет — прежний уже сгорел (ТЗ 9.1)', async () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    await settle();
    expect(lastUrl().searchParams.get('ticket')).toBe('ticket-1');

    FakeEventSource.instances[0]!.fail();
    await advance(2_000);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(lastUrl().searchParams.get('ticket'), 'переподключение повторило сгоревший тикет').toBe(
      'ticket-2'
    );
  });

  it('на одну комнату с одним токеном держится одно соединение на всех подписчиков', async () => {
    const client = new RealtimeClient();
    const first = vi.fn();
    const second = vi.fn();

    const offFirst = client.subscribe('user:u1', 'token-1', first);
    client.subscribe('user:u1', 'token-1', second);
    await settle();

    expect(FakeEventSource.instances).toHaveLength(1);

    FakeEventSource.instances[0]!.emit(event());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // Ушёл один подписчик — соединение нужно второму, закрывать нельзя.
    offFirst();
    expect(FakeEventSource.instances[0]!.closed).toBe(false);
  });

  it('перерисовки экрана не пересоздают соединение и не повторяют события', async () => {
    const client = new RealtimeClient();
    let off = client.subscribe('user:u1', 'token-1', () => {});

    // Двадцать перерисовок: React снимает эффект и тут же ставит его заново.
    for (let i = 0; i < 20; i += 1) {
      off();
      off = client.subscribe('user:u1', 'token-1', () => {});
    }
    await settle();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.closed).toBe(false);
  });

  it('уход последнего подписчика закрывает соединение', async () => {
    const client = new RealtimeClient();
    const off = client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    off();
    await advance(30_000);

    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });

  it('отписка отменяет отложенное переподключение', async () => {
    const client = new RealtimeClient();
    const off = client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    FakeEventSource.instances[0]!.fail();
    off();
    await advance(120_000);

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('переподключение продолжает с последнего события, а не повторяет минуту заново', async () => {
    const client = new RealtimeClient();
    const handler = vi.fn();
    client.subscribe('user:u1', 'token-1', handler);
    await settle();

    FakeEventSource.instances[0]!.emit(event(), '1712-0');
    FakeEventSource.instances[0]!.fail();
    await advance(2_000);

    expect(FakeEventSource.instances).toHaveLength(2);
    const url = lastUrl();
    expect(url.searchParams.get('cursor')).toBe('1712-0');
    expect(url.searchParams.get('since')).toBeNull();
  });

  it('повторные обрывы разводятся по времени, а не долбят сервер каждые две секунды', async () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    FakeEventSource.instances[0]!.fail();
    await advance(2_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[1]!.fail();
    await advance(2_000);
    expect(FakeEventSource.instances).toHaveLength(2);

    await advance(2_000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('успешное подключение сбрасывает разведение по времени', async () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    FakeEventSource.instances[0]!.fail();
    await advance(2_000);
    FakeEventSource.instances[1]!.onopen?.();

    FakeEventSource.instances[1]!.fail();
    await advance(2_000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('разные комнаты и разные токены живут отдельными соединениями', async () => {
    const client = new RealtimeClient();
    client.subscribe('user:u1', 'token-1', () => {});
    client.subscribe('dialog:t1:d1', 'token-1', () => {});
    client.subscribe('user:u1', 'token-2', () => {});
    await settle();

    expect(FakeEventSource.instances).toHaveLength(3);
  });

  it('битое событие не роняет подписку и не приезжает снова после переподключения', async () => {
    const client = new RealtimeClient();
    const handler = vi.fn();
    client.subscribe('user:u1', 'token-1', handler);
    await settle();

    const source = FakeEventSource.instances[0]!;
    source.onmessage?.({ data: 'не-json', lastEventId: '99-0' });
    expect(handler).not.toHaveBeenCalled();

    source.emit(event());
    expect(handler).toHaveBeenCalledTimes(1);

    source.fail();
    await advance(2_000);
    expect(lastUrl().searchParams.get('cursor')).toBe('99-0');
  });

  it('повторный вызов функции отписки не закрывает чужое соединение', async () => {
    const client = new RealtimeClient();
    const offFirst = client.subscribe('user:u1', 'token-1', () => {});
    client.subscribe('user:u1', 'token-1', () => {});
    await settle();

    offFirst();
    offFirst();
    await advance(30_000);

    expect(FakeEventSource.instances[0]!.closed).toBe(false);
  });
});
