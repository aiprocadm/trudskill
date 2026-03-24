import type { AsyncTaskStatus } from '../enums/index';

export interface AsyncTaskRef {
  id: string;
  status: AsyncTaskStatus;
}
