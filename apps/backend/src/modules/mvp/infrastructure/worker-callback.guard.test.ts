import 'reflect-metadata';

import {
  type ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException
} from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkerCallbackGuard } from './worker-callback.guard.js';
import { backendEnv } from '../../../env.js';

function contextWithToken(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === 'x-worker-callback-token' ? token : undefined)
      })
    })
  } as unknown as ExecutionContext;
}

describe('WorkerCallbackGuard', () => {
  const original = backendEnv.WORKER_CALLBACK_SECRET;

  afterEach(() => {
    (backendEnv as { WORKER_CALLBACK_SECRET?: string }).WORKER_CALLBACK_SECRET = original;
  });

  it('fails closed (503) when the secret is not configured', () => {
    (backendEnv as { WORKER_CALLBACK_SECRET?: string }).WORKER_CALLBACK_SECRET = '';
    expect(() => new WorkerCallbackGuard().canActivate(contextWithToken('anything'))).toThrow(
      ServiceUnavailableException
    );
  });

  it('rejects a missing token', () => {
    (backendEnv as { WORKER_CALLBACK_SECRET?: string }).WORKER_CALLBACK_SECRET =
      'super-secret-value';
    expect(() => new WorkerCallbackGuard().canActivate(contextWithToken(undefined))).toThrow(
      ForbiddenException
    );
  });

  it('rejects a wrong token of equal length', () => {
    (backendEnv as { WORKER_CALLBACK_SECRET?: string }).WORKER_CALLBACK_SECRET =
      'super-secret-value';
    expect(() =>
      new WorkerCallbackGuard().canActivate(contextWithToken('wrong-secret-value'))
    ).toThrow(ForbiddenException);
  });

  it('rejects a token of different length without throwing from timingSafeEqual', () => {
    (backendEnv as { WORKER_CALLBACK_SECRET?: string }).WORKER_CALLBACK_SECRET =
      'super-secret-value';
    // A length mismatch must yield a clean 403, not an internal timingSafeEqual length error.
    expect(() => new WorkerCallbackGuard().canActivate(contextWithToken('short'))).toThrow(
      ForbiddenException
    );
  });

  it('allows a matching token', () => {
    (backendEnv as { WORKER_CALLBACK_SECRET?: string }).WORKER_CALLBACK_SECRET =
      'super-secret-value';
    expect(new WorkerCallbackGuard().canActivate(contextWithToken('super-secret-value'))).toBe(
      true
    );
  });
});
