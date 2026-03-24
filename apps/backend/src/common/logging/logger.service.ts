import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppLogger {
  private readonly logger = new Logger('Backend');

  info(message: string, context?: Record<string, unknown>) {
    this.logger.log(`${message} ${context ? JSON.stringify(context) : ''}`);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.logger.warn(`${message} ${context ? JSON.stringify(context) : ''}`);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.logger.error(`${message} ${context ? JSON.stringify(context) : ''}`);
  }
}
