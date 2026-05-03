import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';

import { backendEnv } from '../../../env.js';

/** Доступ к служебным маршрутам только для worker при валидном `x-worker-callback-token`. */
@Injectable()
export class WorkerCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ header: (n: string) => string | undefined }>();
    const secret = backendEnv.WORKER_CALLBACK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'worker_callback_disabled',
        message: 'WORKER_CALLBACK_SECRET is not configured'
      });
    }
    const token = request.header('x-worker-callback-token');
    if (!token || token !== secret) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Invalid worker callback token'
      });
    }
    return true;
  }
}
