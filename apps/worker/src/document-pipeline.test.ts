import { describe, expect, it, vi } from 'vitest';

import { DocumentGenerationPipeline, ErrorNameRetryPolicy } from './document-pipeline.js';

describe('DocumentGenerationPipeline', () => {
  it('processes one job to one generated document', async () => {
    const registerGenerated = vi.fn().mockResolvedValue({ generatedDocumentId: 'g1' });
    const render = vi.fn().mockResolvedValue({ fileId: 'file_1' });
    const pipeline = new DocumentGenerationPipeline({
      setRunning: vi.fn().mockResolvedValue(undefined),
      reserveNumber: vi.fn().mockResolvedValue('DOC-000001'),
      render,
      registerGenerated,
      setCompleted: vi.fn().mockResolvedValue(undefined),
      setFailed: vi.fn().mockResolvedValue(undefined)
    });

    const result = await pipeline.handle({
      id: 't1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorId: 'user-1',
      status: 'queued',
      documentType: 'default',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      templateVersionId: 'v1'
    });

    expect(result.status).toBe('completed');
    expect(registerGenerated).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({
      taskId: 't1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorId: 'user-1',
      number: 'DOC-000001',
      templateVersionId: 'v1'
    });
  });

  it('does not execute side effects for duplicate delivery when task is already claimed', async () => {
    const registerGenerated = vi.fn().mockResolvedValue({ generatedDocumentId: 'g1' });
    const setRunning = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const pipeline = new DocumentGenerationPipeline({
      setRunning,
      reserveNumber: vi.fn().mockResolvedValue('DOC-000001'),
      render: vi.fn().mockResolvedValue({ fileId: 'file_1' }),
      registerGenerated,
      setCompleted: vi.fn().mockResolvedValue(undefined),
      setFailed: vi.fn().mockResolvedValue(undefined)
    });
    const task = {
      id: 'same',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorId: 'user-1',
      status: 'queued' as const,
      documentType: 'default',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      templateVersionId: 'v1'
    };

    const first = await pipeline.handle(task);
    const second = await pipeline.handle(task);

    expect(registerGenerated).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('completed');
    expect(second.status).toBe('queued');
    expect(setRunning).toHaveBeenCalledTimes(2);
  });

  it('marks task as failed when non-retryable render failure happens', async () => {
    const setFailed = vi.fn().mockResolvedValue(undefined);
    const pipeline = new DocumentGenerationPipeline({
      setRunning: vi.fn().mockResolvedValue(undefined),
      reserveNumber: vi.fn().mockResolvedValue('DOC-000001'),
      render: vi.fn().mockRejectedValue(new Error('broken renderer')),
      registerGenerated: vi.fn(),
      setCompleted: vi.fn().mockResolvedValue(undefined),
      setFailed
    });

    const result = await pipeline.handle({
      id: 't-fail',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorId: 'user-1',
      status: 'queued',
      documentType: 'default',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      templateVersionId: 'v1'
    });

    expect(result.status).toEqual('failed');
    expect(setFailed).toHaveBeenCalledWith('t-fail', {
      message: 'broken renderer',
      errorName: 'Error',
      retryDecision: 'fail'
    });
  });

  it('returns queued for retryable failures and does not emit failed side effect', async () => {
    const setFailed = vi.fn().mockResolvedValue(undefined);
    const retryableError = new Error('renderer timeout');
    retryableError.name = 'TimeoutError';

    const pipeline = new DocumentGenerationPipeline(
      {
        setRunning: vi.fn().mockResolvedValue(undefined),
        reserveNumber: vi.fn().mockResolvedValue('DOC-000001'),
        render: vi.fn().mockRejectedValue(retryableError),
        registerGenerated: vi.fn(),
        setCompleted: vi.fn().mockResolvedValue(undefined),
        setFailed
      },
      new ErrorNameRetryPolicy()
    );

    const result = await pipeline.handle({
      id: 't-retry',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      actorId: 'user-1',
      status: 'queued',
      documentType: 'default',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      templateVersionId: 'v1'
    });

    expect(result.status).toBe('queued');
    expect(result.errorMessage).toBe('renderer timeout');
    expect(result.failureDiagnostics).toEqual({
      message: 'renderer timeout',
      errorName: 'TimeoutError',
      retryDecision: 'retry'
    });
    expect(setFailed).not.toHaveBeenCalled();
  });

  it('reprocesses successfully after retryable failure (worker restart/replay regression)', async () => {
    const setFailed = vi.fn().mockResolvedValue(undefined);
    const registerGenerated = vi.fn().mockResolvedValue({ generatedDocumentId: 'g-replayed' });
    const render = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('temporary broker outage'), { name: 'ServiceUnavailableError' })
      )
      .mockResolvedValueOnce({ fileId: 'file_after_retry' });
    const pipeline = new DocumentGenerationPipeline(
      {
        setRunning: vi.fn().mockResolvedValue(true),
        reserveNumber: vi.fn().mockResolvedValue('DOC-000777'),
        render,
        registerGenerated,
        setCompleted: vi.fn().mockResolvedValue(undefined),
        setFailed
      },
      new ErrorNameRetryPolicy()
    );
    const task = {
      id: 't-replay',
      tenantId: 'tenant-1',
      correlationId: 'corr-replay',
      actorId: 'user-1',
      status: 'queued' as const,
      documentType: 'default',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      templateVersionId: 'v1'
    };

    const first = await pipeline.handle(task);
    const second = await pipeline.handle(task);

    expect(first.status).toBe('queued');
    expect(first.failureDiagnostics?.retryDecision).toBe('retry');
    expect(second.status).toBe('completed');
    expect(registerGenerated).toHaveBeenCalledTimes(1);
    expect(setFailed).not.toHaveBeenCalled();
  });
});
