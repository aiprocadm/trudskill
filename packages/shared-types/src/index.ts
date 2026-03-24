export type UUID = string;

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  service: 'frontend' | 'backend' | 'worker' | 'realtime';
}
