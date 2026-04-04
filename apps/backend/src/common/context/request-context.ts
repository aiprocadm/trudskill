export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  roles?: string[];
  requestedTenantId?: string;
  ip?: string;
  userAgent?: string;
}
