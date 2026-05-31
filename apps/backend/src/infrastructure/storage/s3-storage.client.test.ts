import { describe, expect, it, vi } from 'vitest';

import { S3StorageClient } from './s3-storage.client.js';

describe('S3StorageClient.putObject', () => {
  it('sends a PutObjectCommand with body', async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = new S3StorageClient();
    (client as unknown as { client: { send: typeof send } }).client = { send } as never;

    await client.putObject({
      key: 'tenant/x/file.xlsx',
      body: Buffer.from('abc'),
      contentType: 'application/octet-stream'
    });

    expect(send).toHaveBeenCalledOnce();
    const [command] = send.mock.calls[0] as [{ input: Record<string, unknown> }];
    expect(command.input).toMatchObject({
      Key: 'tenant/x/file.xlsx',
      ContentType: 'application/octet-stream'
    });
  });
});
