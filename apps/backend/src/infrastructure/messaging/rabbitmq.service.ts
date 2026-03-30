import { Injectable } from '@nestjs/common';
import { backendEnv } from '../../env.js';
import { checkTcpEndpoint } from '../health/tcp-check.util.js';

@Injectable()
export class RabbitMqService {
  async ping(): Promise<boolean> {
    return checkTcpEndpoint(backendEnv.RABBITMQ_URL);
  }

  async publish(exchange: string, routingKey: string, payload: unknown): Promise<void> {
    void exchange;
    void routingKey;
    void payload;
  }
}
