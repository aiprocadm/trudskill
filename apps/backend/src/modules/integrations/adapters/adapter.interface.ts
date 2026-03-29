export interface IntegrationAdapter {
  readonly providerCode: string;
  testConnection(input: { credentials: Record<string, unknown> }): Promise<{ ok: boolean; details?: string }>;
  prepareExportPayload(input: { exportType: string; sourceFilter: Record<string, unknown> }): Promise<Record<string, unknown>>;
  sendExportBatch(input: { payload: Record<string, unknown> }): Promise<{ status: 'completed' | 'partial_success'; externalBatchId: string }>;
  handleWebhook(input: { eventType: string; payload: Record<string, unknown> }): Promise<{ status: 'accepted' | 'processed'; externalId?: string }>;
  mapExternalStatus(status: string): 'completed' | 'failed' | 'partial_success';
  normalizeError(error: unknown): { code: string; message: string };
  supports(input: { exportType?: string; webhookEventType?: string }): boolean;
}
