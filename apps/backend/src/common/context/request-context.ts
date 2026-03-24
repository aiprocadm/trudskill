export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}
