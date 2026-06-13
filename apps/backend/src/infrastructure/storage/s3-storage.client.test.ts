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

describe('S3StorageClient.listObjectKeys', () => {
  it('single page — returns all keys when IsTruncated is false', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ IsTruncated: false, Contents: [{ Key: 'a' }, { Key: 'b' }] });
    const client = new S3StorageClient();
    (client as unknown as { client: { send: typeof send } }).client = { send } as never;

    const keys = await client.listObjectKeys({ prefix: 'scorm/tenant1/' });

    expect(send).toHaveBeenCalledOnce();
    expect(keys).toEqual(['a', 'b']);
  });

  it('multi-page — follows NextContinuationToken and collects all keys', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: 't1',
        Contents: [{ Key: 'a' }]
      })
      .mockResolvedValueOnce({ IsTruncated: false, Contents: [{ Key: 'b' }] });
    const client = new S3StorageClient();
    (client as unknown as { client: { send: typeof send } }).client = { send } as never;

    const keys = await client.listObjectKeys({ prefix: 'scorm/tenant1/' });

    expect(send).toHaveBeenCalledTimes(2);
    const [secondCommand] = send.mock.calls[1] as [{ input: Record<string, unknown> }];
    expect(secondCommand.input).toMatchObject({ ContinuationToken: 't1' });
    expect(keys).toEqual(['a', 'b']);
  });

  it('empty bucket — returns [] when Contents is undefined', async () => {
    const send = vi.fn().mockResolvedValue({ IsTruncated: false });
    const client = new S3StorageClient();
    (client as unknown as { client: { send: typeof send } }).client = { send } as never;

    const keys = await client.listObjectKeys({ prefix: 'scorm/tenant1/' });

    expect(send).toHaveBeenCalledOnce();
    expect(keys).toEqual([]);
  });
});
