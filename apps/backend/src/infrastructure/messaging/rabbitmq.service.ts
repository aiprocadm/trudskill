import { Injectable } from '@nestjs/common';
import * as amqp from 'amqplib';

import { backendEnv } from '../../env.js';

import type { ChannelModel, ConfirmChannel } from 'amqplib';

@Injectable()
export class RabbitMqService {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;

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
    await this.waitForConfirms(channel, 5_000);
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (!this.connection) {
      this.connection = await amqp.connect(backendEnv.RABBITMQ_URL);
    }

    if (!this.channel) {
      this.channel = await this.connection.createConfirmChannel();
    }

    return this.channel;
  }

  private async waitForConfirms(channel: ConfirmChannel, timeoutMs: number): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`RabbitMQ publish confirm timeout after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      await Promise.race([channel.waitForConfirms(), timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
