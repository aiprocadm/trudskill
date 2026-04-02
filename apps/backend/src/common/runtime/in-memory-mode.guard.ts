import { ServiceUnavailableException } from '@nestjs/common';
import { backendEnv } from '../../env.js';

export function isInMemoryStateEnabled(): boolean {
  return backendEnv.NODE_ENV === 'test' || backendEnv.ALLOW_IN_MEMORY_STATE;
}

export function ensureInMemoryModeAllowed(serviceName: string): void {
  if (isInMemoryStateEnabled()) {
    return;
  }

  throw new ServiceUnavailableException({
    code: 'in_memory_state_disabled',
    message: `${serviceName} cannot run with in-memory state outside of test/demo mode`
  });
}
