import { Injectable } from '@nestjs/common';
import * as amqp from 'amqplib';

import { backendEnv } from '../../env.js';

import type { Channel, ChannelModel } from 'amqplib';

@Injectable()
export class RabbitMqService {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  async ping(): Promise<boolean> {
    try {
      await this.getChannel();
      return true;
    } catch {
      return false;
    }
  }

  async publish(exchange: string, routingKey: string, payload: unknown): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertExchange(exchange, 'topic', { durable: true });
    channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json'
    });
  }

  private async getChannel(): Promise<Channel> {
    if (!this.connection) {
      this.connection = await amqp.connect(backendEnv.RABBITMQ_URL);
    }

    if (!this.channel) {
      this.channel = await this.connection.createChannel();
    }

    return this.channel;
  }
}
