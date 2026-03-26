import { describe, expect, it, vi } from 'vitest';
import { DocumentGenerationPipeline } from './document-pipeline.js';

describe('DocumentGenerationPipeline', () => {
  it('processes one job to one generated document', async () => {
    const registerGenerated = vi.fn().mockResolvedValue({ generatedDocumentId: 'g1' });
    const pipeline = new DocumentGenerationPipeline({
      reserveNumber: vi.fn().mockResolvedValue('DOC-000001'),
      render: vi.fn().mockResolvedValue({ fileId: 'file_1' }),
      registerGenerated
    });

    const result = await pipeline.handle({
      id: 't1',
      tenantId: 'tenant-1',
      status: 'queued',
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      templateVersionId: 'v1'
    });

    expect(result.status).toBe('completed');
    expect(registerGenerated).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for duplicate delivery', async () => {
    const registerGenerated = vi.fn().mockResolvedValue({ generatedDocumentId: 'g1' });
    const pipeline = new DocumentGenerationPipeline({
      reserveNumber: vi.fn().mockResolvedValue('DOC-000001'),
      render: vi.fn().mockResolvedValue({ fileId: 'file_1' }),
      registerGenerated
    });
    const task = { id: 'same', tenantId: 'tenant-1', status: 'queued' as const, sourceEntityType: 'group', sourceEntityId: 'g1', templateVersionId: 'v1' };

    await pipeline.handle(task);
    await pipeline.handle(task);

    expect(registerGenerated).toHaveBeenCalledTimes(1);
  });
});
