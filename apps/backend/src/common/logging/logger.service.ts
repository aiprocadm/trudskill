import { Injectable } from '@nestjs/common';

import { safeSerialize } from './redaction.util.js';
import { backendEnv } from '../../env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

@Injectable()
export class AppLogger {
  private write(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service_name: 'backend',
      environment: backendEnv.NODE_ENV,
      version: backendEnv.RELEASE_VERSION,
      message,
      ...context
    };
    process.stdout.write(`${safeSerialize(payload)}\n`);
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.write('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>) {
    this.write('fatal', message, context);
  }
}
