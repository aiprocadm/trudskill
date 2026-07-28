import type { AsyncTaskStatus } from '../enums/index.js';

export interface AsyncTaskRef {
  id: string;
  status: AsyncTaskStatus;
}
