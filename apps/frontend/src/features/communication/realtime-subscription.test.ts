import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * ТЗ 9.1: подменяем ТОЛЬКО выдачу тикета. Полная подмена модуля унесла бы и остальные его
 * функции, которыми пользуются соседние модули, — проверено на себе.
 */
vi.mock('../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiRequest: vi.fn(async () => ({ ticket: 'ticket-1', expiresInSeconds: 30 }))
}));

import { openRealtimeSubscription } from './hooks';

import type { RealtimeEventEnvelope } from '@trudskill/api-contracts';

/**
 * Фаза 6, дефект A (часть про хуки).
 *
 * `useNotificationsRealtime` держал колбэк экрана в зависимостях эффекта. Колбэк —
 * новая стрелка на каждый рендер, значит подписка пересобиралась после каждой
 * перерисовки, а перерисовку вызывало само событие. Круг замыкался.
 *
 * React-рендерера в проекте нет (тесты — только на чистых функциях), поэтому
 * поведение проверяем на вынесенной из эффекта функции `openRealtimeSubscription`,
 * а сами зависимости эффекта — сторожевой проверкой исходника: вернуть колбэк в
 * зависимости уже не выйдет незаметно.
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onmessage: ((message: { data: string; lastEventId?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(event: RealtimeEventEnvelope) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const event = (): RealtimeEventEnvelope =>
  ({
    event_name: 'notification.created',
    version: 'v1',
    tenant_id: 'tenant_demo',
    occurred_at: '2026-08-08T10:00:00.000Z',
    payload: {}
  }) as RealtimeEventEnvelope;

const hooksSource = readFileSync(new URL('./hooks.ts', import.meta.url), 'utf8');
const appShellSource = readFileSync(
  new URL('../../widgets/shell/app-shell.tsx', import.meta.url),
  'utf8'
);

describe('живые подписки коммуникаций (Фаза 6, дефект A)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('без сессии или без комнаты подписки не создаётся', () => {
    expect(openRealtimeSubscription(null, 'token-1', { current: () => {} })).toBeUndefined();
    expect(openRealtimeSubscription('user:u1', null, { current: () => {} })).toBeUndefined();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('смена колбэка не требует переподписки: событие уходит в последнюю версию', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const callbackRef = { current: first };

    const off = openRealtimeSubscription('user:u1', 'token-1', callbackRef);
    /*
     * ТЗ 9.1: между подпиской и открытием потока появился шаг — поход за одноразовым тикетом.
     * Утверждение теста прежнее, ждать приходится на одну микрозадачу дольше (журнал 571).
     */
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(FakeEventSource.instances).toHaveLength(1);

    FakeEventSource.instances[0]!.emit(event());
    expect(first).toHaveBeenCalledTimes(1);

    // Перерисовка экрана: колбэк пересоздан, соединение то же самое.
    callbackRef.current = second;
    FakeEventSource.instances[0]!.emit(event());

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    off?.();
    vi.advanceTimersByTime(30_000);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });

  it('колбэк экрана не участвует в зависимостях эффекта', () => {
    // Массив зависимостей — последний аргумент хука: `..., [room, token])`.
    const dependencyArrays = hooksSource.match(/,\s*\[[^\]]*\]\s*\)/g) ?? [];
    expect(dependencyArrays.length).toBeGreaterThan(0);
    for (const deps of dependencyArrays) {
      expect(deps).not.toMatch(/onRefresh|onEvent/);
    }
  });

  it('колбэк живёт в ref (иначе он вернётся в зависимости)', () => {
    expect(hooksSource).toMatch(/useRef/);
    expect(hooksSource).toMatch(/callbackRef\.current/);
  });

  it('шапка не заказывает второй запрос счётчика на то же событие', () => {
    // Ключ ['notifications'] сбрасывает сам хук — свой колбэк тут удваивал запросы.
    expect(appShellSource).toMatch(/useNotificationsRealtime\(\)/);
  });
});
