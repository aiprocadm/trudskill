export type ISODateString = string;

export interface RequestMeta {
  requestId: string;
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
