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

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({ url: backendEnv.REDIS_URL });
      await this.client.connect();
    }

    return this.client;
  }
}
