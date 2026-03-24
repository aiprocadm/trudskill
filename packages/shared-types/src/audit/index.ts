import type { ISODateString } from '../core/index';
import type { RequestId } from '../ids/index';

export interface RequestMeta {
  requestId: RequestId;
  timestamp: ISODateString;
}

export interface ValidationIssue {
  path: string;
  message: string;
  code?: string;
}

export interface ErrorDetails {
  reason?: string;
  issues?: ValidationIssue[];
  context?: Record<string, unknown>;
}
