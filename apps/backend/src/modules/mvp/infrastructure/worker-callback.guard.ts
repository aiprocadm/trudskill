import { timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';

import { backendEnv } from '../../../env.js';

/** Constant-time secret comparison (CWE-208): avoids leaking the secret via response timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch; the length guard is itself non-secret.
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Доступ к служебным/ops-маршрутам только для доверенного вызывающего при валидном
 * `x-worker-callback-token` (shared secret). Используется и worker-callback'ами, и
 * кросс-тенантными ops-инструментами (миграции/backfill), которым `TenantGuard` не подходит.
 * Fail-closed: если секрет не сконфигурирован — маршрут недоступен (503).
 */
@Injectable()
export class WorkerCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ header: (n: string) => string | undefined }>();
    const secret = backendEnv.WORKER_CALLBACK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'worker_callback_disabled',
        message: 'WORKER_CALLBACK_SECRET is not configured'
      });
    }
    const token = request.header('x-worker-callback-token');
    if (!token || !secretsMatch(token, secret)) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Invalid worker callback token'
      });
    }
    return true;
  }
}
