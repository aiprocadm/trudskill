export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  roles?: string[];
  /** Последнее разрешённое множество прав IAM (выставляет `PermissionGuard`). */
  permissions?: string[];
  requestedTenantId?: string;
  ip?: string;
  userAgent?: string;
}
