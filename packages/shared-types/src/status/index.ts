import type { ISODateString } from '../core/index';

export interface StatusModel<TStatus extends string = string> {
  status: TStatus;
  changedAt: ISODateString;
  reason?: string;
}

export interface LifecycleState {
  isActive: boolean;
  isArchived: boolean;
}

export * from './health';
