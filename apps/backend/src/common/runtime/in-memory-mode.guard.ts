import { ServiceUnavailableException } from '@nestjs/common';
import { backendEnv } from '../../env.js';

export function ensureInMemoryModeAllowed(serviceName: string): void {
  const isAllowed = backendEnv.NODE_ENV === 'test' || backendEnv.ALLOW_IN_MEMORY_STATE;
  if (isAllowed) {
    return;
  }

  throw new ServiceUnavailableException({
    code: 'in_memory_state_disabled',
    message: `${serviceName} cannot run with in-memory state outside of test/demo mode`
  });
}
