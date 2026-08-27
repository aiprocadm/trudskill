import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Ревизия 2026-08-27 (порция 35, журнал 274) — бэкенд обязан пережить перезапуск брокера.
 *
 * Соединение и канал кэшировались НАВСЕГДА: после перезапуска RabbitMQ (обновление, сбой)
 * закэшированный канал оставался мёртвым до перезапуска самого приложения — каждая
 * публикация падала «Channel closed», и оплаты, письма и задачи выпуска переставали
 * уходить. Хуже: соединение amqplib — это EventEmitter, а событие `error` никто не
 * слушал; в Node необработанный `error` на EventEmitter роняет ВЕСЬ процесс.
 *
 * Брокер здесь подставной: настоящий в тестах не поднять, а проверять надо именно
 * поведение при обрыве.
 */

class FakeChannel extends EventEmitter {
  closed = false;
  readonly published: Array<{ exchange: string; routingKey: string }> = [];
  assertExchange = vi.fn(async () => ({}) as never);
  waitForConfirms = vi.fn(async () => undefined);
  publish(exchange: string, routingKey: string): boolean {
    if (this.closed) throw new Error('Channel closed');
    this.published.push({ exchange, routingKey });
    return true;
  }
}

class FakeConnection extends EventEmitter {
  readonly channels: FakeChannel[] = [];
  createConfirmChannel = vi.fn(async () => {
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel as unknown as never;
  });
  close = vi.fn(async () => undefined);
}

const connections: FakeConnection[] = [];
const connect = vi.fn(async () => {
  const connection = new FakeConnection();
  connections.push(connection);
  return connection as unknown as never;
});

vi.mock('amqplib', () => ({ connect: (...args: unknown[]) => connect(...(args as [])) }));

const importService = async () => {
  const module = await import('./rabbitmq.service.js');
  return new module.RabbitMqService();
};

describe('очередь переживает перезапуск брокера (порция 35)', () => {
  beforeEach(() => {
    connections.length = 0;
    connect.mockClear();
  });

  it('обычная публикация использует одно соединение', async () => {
    const service = await importService();
    await service.publish('events', 'a.b', { x: 1 });
    await service.publish('events', 'a.c', { x: 2 });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connections[0]?.channels[0]?.published).toHaveLength(2);
  });

  it('обрыв соединения не роняет процесс: событие ошибки слушается', async () => {
    const service = await importService();
    await service.publish('events', 'a.b', { x: 1 });

    // Без слушателя это выражение уронило бы процесс целиком.
    expect(() => connections[0]?.emit('error', new Error('broker restarted'))).not.toThrow();
  });

  it('после обрыва следующая публикация поднимает НОВОЕ соединение', async () => {
    const service = await importService();
    await service.publish('events', 'a.b', { x: 1 });
    connections[0]?.emit('close');

    await service.publish('events', 'a.d', { x: 3 });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connections[1]?.channels[0]?.published).toHaveLength(1);
  });

  it('закрытие КАНАЛА тоже лечится — не только соединения', async () => {
    const service = await importService();
    await service.publish('events', 'a.b', { x: 1 });
    connections[0]?.channels[0]?.emit('close');

    await service.publish('events', 'a.e', { x: 4 });

    expect(connections[0]?.channels).toHaveLength(2);
  });

  it('проверка связи не врёт: на мёртвом соединении отвечает «нет»', async () => {
    const service = await importService();
    await service.publish('events', 'a.b', { x: 1 });
    expect(await service.ping()).toBe(true);

    connections[0]?.emit('close');
    connect.mockRejectedValueOnce(new Error('broker down'));

    expect(await service.ping()).toBe(false);
  });

  it('параллельные публикации не плодят соединений', async () => {
    const service = await importService();
    await Promise.all([
      service.publish('events', 'p.1', {}),
      service.publish('events', 'p.2', {}),
      service.publish('events', 'p.3', {})
    ]);

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
