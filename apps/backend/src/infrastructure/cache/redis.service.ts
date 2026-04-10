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
      return false;
    }
  }

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({ url: backendEnv.REDIS_URL });
      await this.client.connect();
    }

    return this.client;
  }
}
