import { Injectable } from '@nestjs/common';
import { type RedisClientType, createClient } from 'redis';

import { backendEnv } from '../../env.js';

@Injectable()
export class RedisService {
  private client: RedisClientType | null = null;

  async ping(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const response = await client.ping();
      return response === 'PONG';
    } catch {
      // Недоступность и ЕСТЬ ответ: проверка живости для того и вызывается.
      return false;
    }
  }

  /**
   * Положить значение на ограниченный срок.
   *
   * Используется одноразовыми тикетами подключения к трансляции (ТЗ 9.1). Срок задаётся
   * хранилищем, а не проверяется нами при чтении: так запись исчезает сама, даже если её никто
   * не забрал, и хранилище не превращается в свалку просроченных тикетов.
   */
  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();
    await client.set(key, value, { EX: ttlSeconds });
  }

  /**
   * Увеличить счётчик и вернуть новое значение; срок ставится при первом увеличении.
   *
   * Используется защитой входа (ТЗ 17.1). Срок ставится только на первом шаге намеренно: иначе
   * каждая новая неудачная попытка продлевала бы окно, и счётчик не сбрасывался бы никогда —
   * человек, ошибившийся девять раз за год, однажды получил бы блокировку на десятой.
   */
  async incrementWithWindow(key: string, ttlSeconds: number): Promise<number> {
    const client = await this.getClient();
    const value = await client.incr(key);
    if (value === 1) await client.expire(key, ttlSeconds);
    return value;
  }

  /** Сколько секунд осталось жить записи. Отрицательное значение означает «записи нет». */
  async secondsToLive(key: string): Promise<number> {
    const client = await this.getClient();
    return client.ttl(key);
  }

  async remove(key: string): Promise<void> {
    const client = await this.getClient();
    await client.del(key);
  }

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({ url: backendEnv.REDIS_URL });
      await this.client.connect();
    }

    return this.client;
  }
}
