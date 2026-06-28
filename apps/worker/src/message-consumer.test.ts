import { describe, expect, it, vi } from 'vitest';

import { type WorkerEnvelope, consumeMessage } from './message-consumer.js';

const envelope: WorkerEnvelope = {
  messageId: 'msg-1',
  tenantId: 'tenant-1',
  jobType: 'bulk_enrollment',
  payload: { idempotencyKey: 'idem-1', groupId: 'g1' }
};

describe('consumeMessage', () => {
  it('processes a fresh message then marks it processed (mark AFTER success)', async () => {
    const order: string[] = [];
    const processJob = vi.fn().mockImplementation(async () => {
      order.push('process');
    });
    const markProcessed = vi.fn().mockImplementation(async () => {
      order.push('mark');
    });

    const outcome = await consumeMessage(envelope, {
      hasBeenProcessed: vi.fn().mockResolvedValue(false),
      markProcessed,
      processJob
    });

    expect(outcome).toEqual({ kind: 'processed' });
    expect(processJob).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledTimes(1);
    // The dedup mark must be written only after the job succeeds.
    expect(order).toEqual(['process', 'mark']);
  });

  it('skips a message that was already processed, without running the job', async () => {
    const processJob = vi.fn().mockResolvedValue(undefined);
    const markProcessed = vi.fn().mockResolvedValue(undefined);

    const outcome = await consumeMessage(envelope, {
      hasBeenProcessed: vi.fn().mockResolvedValue(true),
      markProcessed,
      processJob
    });

    expect(outcome).toEqual({ kind: 'skipped_duplicate' });
    expect(processJob).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
  });

  it('does NOT mark a failed job as processed, so a retry re-runs it (data-loss regression)', async () => {
    const markProcessed = vi.fn().mockResolvedValue(undefined);
    const error = new Error('transient DB blip');
    const processJob = vi
      .fn()
      .mockRejectedValueOnce(error) // first attempt fails transiently
      .mockResolvedValueOnce(undefined); // retry succeeds

    // First delivery: job throws.
    const first = await consumeMessage(envelope, {
      hasBeenProcessed: vi.fn().mockResolvedValue(false),
      markProcessed,
      processJob
    });

    expect(first).toEqual({ kind: 'failed', error });
    // Critical: a failed job must NOT have been recorded as processed,
    // otherwise the redelivered retry is skipped as a duplicate and lost.
    expect(markProcessed).not.toHaveBeenCalled();

    // Redelivery (retry): dedup table still has no record → re-run, now succeeds.
    const second = await consumeMessage(envelope, {
      hasBeenProcessed: vi.fn().mockResolvedValue(false),
      markProcessed,
      processJob
    });

    expect(second).toEqual({ kind: 'processed' });
    expect(processJob).toHaveBeenCalledTimes(2);
    expect(markProcessed).toHaveBeenCalledTimes(1);
  });
});
