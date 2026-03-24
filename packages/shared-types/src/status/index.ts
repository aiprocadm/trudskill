import type { EntityStatus } from '../enums/index';

export interface StatusModel {
  status: EntityStatus;
  statusChangedAt?: string;
  statusReason?: string;
}

export * from './health';
