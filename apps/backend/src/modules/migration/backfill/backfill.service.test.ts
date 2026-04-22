import { describe, expect, it, vi } from 'vitest';

import { BackfillService } from './backfill.service.js';

import type { ReconciliationReport } from './backfill.types.js';

const reportFixture: ReconciliationReport = {
  generatedAt: '2026-04-22T00:00:00.000Z',
  runId: 'run_1',
  domain: 'documents',
  summary: {
    totalCountPartitions: 1,
    totalStatusPartitions: 1,
    totalMismatches: 1
  },
  counts: [
    {
      tenant_id: 'tenant_1',
      collection: 'contracts',
      source_count: 10,
      target_count: 10
    }
  ],
  statusDistributions: [
    {
      tenant_id: 'tenant_1',
      collection: 'contracts',
      status: 'published',
      source_status_count: 9,
      target_status_count: 9
    }
  ],
  missingOrMismatchedRecords: [
    {
      tenant_id: 'tenant_1',
      collection: 'contracts',
      id: 'doc_1',
      source_hash: 'a',
      target_hash: 'b',
      reason: 'hash_mismatch'
    }
  ]
};

describe('BackfillService', () => {
  it('runs batches until completion', async () => {
    const service = new BackfillService({} as never);
    const processNextBatch = vi
      .spyOn(service, 'processNextBatch')
      .mockResolvedValueOnce({ processed: 2, completed: false })
      .mockResolvedValueOnce({ processed: 3, completed: true });

    const result = await service.runUntilComplete('run_1', 10);

    expect(result).toEqual({ processed: 5, completed: true });
    expect(processNextBatch).toHaveBeenCalledTimes(2);
  });

  it('exports reconciliation report in JSON format', async () => {
    const service = new BackfillService({} as never);
    vi.spyOn(service, 'getReport').mockResolvedValue({
      run: null,
      report: reportFixture
    });

    const payload = await service.exportReport('run_1', 'json');

    expect(payload).toEqual(reportFixture);
  });

  it('exports reconciliation report in CSV format', async () => {
    const service = new BackfillService({} as never);
    vi.spyOn(service, 'getReport').mockResolvedValue({
      run: null,
      report: reportFixture
    });

    const payload = await service.exportReport('run_1', 'csv');

    expect(typeof payload).toBe('string');
    expect(payload).toContain('section,tenant_id,collection,status');
    expect(payload).toContain('counts,tenant_1,contracts,,10,10');
    expect(payload).toContain('status_distribution,tenant_1,contracts,published');
    expect(payload).toContain('mismatch,tenant_1,contracts,,,,,,doc_1,hash_mismatch,a,b');
  });
});
