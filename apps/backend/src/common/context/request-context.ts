export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  roles?: string[];
  /** Последнее разрешённое множество прав IAM (выставляет `PermissionGuard`). */
  permissions?: string[];
  /**
   * ФТ-E5 (Фаза 4): контрагент представителя заказчика. Пусто у персонала центра —
   * они не представители и скоупу по контрагенту не подлежат.
   *
   * Важно: скоуп строится ИМЕННО отсюда, а не из параметра запроса. Идентификатор,
   * пришедший от клиента, можно подменить; личность актора — нет.
   */
  counterpartyId?: string;
  requestedTenantId?: string;
  ip?: string;
  userAgent?: string;
}
