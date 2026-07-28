import type { ISODateString } from '../core/index.js';

export interface HealthStatus {
  status: 'ok';
  timestamp: ISODateString;
  service: 'frontend' | 'backend' | 'worker' | 'realtime';
}
