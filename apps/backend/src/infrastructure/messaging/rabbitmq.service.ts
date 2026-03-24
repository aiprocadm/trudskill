import { Injectable } from '@nestjs/common';

@Injectable()
export class RabbitMqService {
  async ping(): Promise<boolean> {
    return true;
  }

  async publish(exchange: string, routingKey: string, payload: unknown): Promise<void> {
    void exchange;
    void routingKey;
    void payload;
  }
}
