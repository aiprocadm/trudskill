import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  noteServerTime,
  resetServerClockForTests,
  serverClockOffsetMs,
  serverNow
} from './server-clock';

/*
 * Ревизия 2026-08-27 (порция 25, журнал 275): обратный отсчёт попытки обязан идти по
 * часам сервера. До этого он шёл по часам устройства, и отстающие часы слушателя
 * показывали лишние минуты — автосдача уезжала за срок, попытка обнулялась.
 */
describe('часы сервера (порция 25)', () => {
  afterEach(() => {
    resetServerClockForTests();
    vi.useRealTimers();
  });

  it('без единой сверки живёт по часам устройства', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'));
    expect(serverClockOffsetMs()).toBeNull();
    expect(serverNow()).toBe(Date.parse('2026-08-27T10:00:00.000Z'));
  });

  it('отстающие часы устройства подтягиваются к серверу', () => {
    vi.useFakeTimers();
    // Устройство считает, что 09:58, сервер отвечает «10:00»: часы отстают на две минуты.
    vi.setSystemTime(new Date('2026-08-27T09:58:00.000Z'));
    const sentAt = Date.now();
    noteServerTime('2026-08-27T10:00:00.000Z', sentAt, sentAt);

    expect(serverClockOffsetMs()).toBe(120_000);
    expect(serverNow()).toBe(Date.parse('2026-08-27T10:00:00.000Z'));
  });

  it('дорога до сервера учитывается половиной: ответ сформирован по пути', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'));
    const sentAt = Date.now();
    // Ответ шёл 400 мс, серверное время — ровно «сейчас» по часам устройства.
    noteServerTime('2026-08-27T10:00:00.000Z', sentAt, sentAt + 400);
    expect(serverClockOffsetMs()).toBe(-200);
  });

  it('выигрывает оценка по самому быстрому ответу, а не последняя', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'));
    const sentAt = Date.now();
    noteServerTime('2026-08-27T10:00:05.000Z', sentAt, sentAt + 20); // быстрый ответ
    const fast = serverClockOffsetMs();
    noteServerTime('2026-08-27T10:00:30.000Z', sentAt, sentAt + 9_000); // долгий ответ
    expect(serverClockOffsetMs()).toBe(fast);
  });

  it('мусорное время игнорируется: сверка часов не роняет запросы', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'));
    const sentAt = Date.now();
    noteServerTime('не время', sentAt, sentAt);
    noteServerTime('', sentAt, sentAt);
    expect(serverClockOffsetMs()).toBeNull();
    expect(serverNow()).toBe(sentAt);
  });
});
