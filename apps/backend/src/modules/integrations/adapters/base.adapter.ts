import type { IntegrationAdapter } from './adapter.interface.js';

export abstract class BaseAdapter implements IntegrationAdapter {
  abstract readonly providerCode: string;

  async testConnection(): Promise<{ ok: boolean; details?: string }> { return { ok: true, details: 'stub connection ok' }; }
  async prepareExportPayload(input: { exportType: string; sourceFilter: Record<string, unknown> }): Promise<Record<string, unknown>> {
    return { provider: this.providerCode, exportType: input.exportType, filter: input.sourceFilter };
  }
  async sendExportBatch(): Promise<{ status: 'completed' | 'partial_success'; externalBatchId: string }> {
    return { status: 'completed', externalBatchId: `${this.providerCode}_batch_${Date.now()}` };
  }
  async handleWebhook(): Promise<{ status: 'accepted' | 'processed'; externalId?: string }> {
    return { status: 'processed', externalId: `${this.providerCode}_event_${Date.now()}` };
  }
  mapExternalStatus(status: string): 'completed' | 'failed' | 'partial_success' {
    if (status.toLowerCase().includes('partial')) return 'partial_success';
    if (status.toLowerCase().includes('error') || status.toLowerCase().includes('fail')) return 'failed';
    return 'completed';
  }
  normalizeError(error: unknown): { code: string; message: string } {
    return { code: 'integration_error', message: error instanceof Error ? error.message : 'Integration adapter error' };
  }
  supports(): boolean { return true; }
}
