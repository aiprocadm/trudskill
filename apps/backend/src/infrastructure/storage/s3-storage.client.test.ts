import { describe, expect, it, vi } from 'vitest';

/** Чем создан клиент S3: тесты ниже подменяют `.client`, этот перехват нужен одному — про сроки. */
const { s3ClientOptions } = vi.hoisted(() => ({ s3ClientOptions: [] as unknown[] }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  S3Client: class {
    send = vi.fn().mockResolvedValue({});
    constructor(options: unknown) {
      s3ClientOptions.push(options);
    }
  }
}));

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

/** Загрузка по частям (ФТ-B1.1, Фаза 2 Task 2) — видео 2–4 ГБ одним PUT не проходит. */
describe('S3StorageClient — multipart', () => {
  const withSend = (result: unknown) => {
    const send = vi.fn().mockResolvedValue(result);
    const client = new S3StorageClient();
    (client as unknown as { client: { send: typeof send } }).client = { send } as never;
    return { client, send };
  };

  it('createMultipartUpload возвращает UploadId', async () => {
    const { client, send } = withSend({ UploadId: 'upl_1' });

    const ref = await client.createMultipartUpload({
      key: 'video/t/lesson.mp4',
      contentType: 'video/mp4'
    });

    expect(ref).toEqual({ key: 'video/t/lesson.mp4', uploadId: 'upl_1' });
    const [command] = send.mock.calls[0] as [{ input: Record<string, unknown> }];
    expect(command.input).toMatchObject({ Key: 'video/t/lesson.mp4', ContentType: 'video/mp4' });
  });

  it('S3 без UploadId — падаем сразу, а не отдаём наверх пустоту', async () => {
    const { client } = withSend({});
    await expect(
      client.createMultipartUpload({ key: 'k', contentType: 'video/mp4' })
    ).rejects.toThrow(/UploadId/);
  });

  it('completeMultipartUpload сортирует части по номеру — S3 требует возрастания', async () => {
    const { client, send } = withSend({});

    await client.completeMultipartUpload({
      key: 'video/t/lesson.mp4',
      uploadId: 'upl_1',
      // Клиент прислал вразнобой: части заливаются параллельно и финишируют как придётся.
      parts: [
        { partNumber: 3, etag: '"c"' },
        { partNumber: 1, etag: '"a"' },
        { partNumber: 2, etag: '"b"' }
      ]
    });

    const [command] = send.mock.calls[0] as [{ input: { MultipartUpload: { Parts: unknown[] } } }];
    expect(command.input.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: '"a"' },
      { PartNumber: 2, ETag: '"b"' },
      { PartNumber: 3, ETag: '"c"' }
    ]);
  });

  it('abortMultipartUpload шлёт команду отмены', async () => {
    const { client, send } = withSend({});

    await client.abortMultipartUpload({ key: 'video/t/lesson.mp4', uploadId: 'upl_1' });

    const [command] = send.mock.calls[0] as [{ input: Record<string, unknown> }];
    expect(command.input).toMatchObject({ Key: 'video/t/lesson.mp4', UploadId: 'upl_1' });
  });
});

describe('S3StorageClient срок ожидания (журнал 335)', () => {
  it('клиент создаётся со сроками подключения и ответа: молчащее хранилище не держит загрузку', async () => {
    const client = new S3StorageClient();
    await client.putObject({ key: 'k', body: Buffer.from('a'), contentType: 'text/plain' });

    expect(s3ClientOptions).toHaveLength(1);
    const [options] = s3ClientOptions as [
      { requestHandler?: { connectionTimeout?: number; socketTimeout?: number } }
    ];
    expect(options.requestHandler?.connectionTimeout ?? 0).toBeGreaterThan(0);
    expect(options.requestHandler?.socketTimeout ?? 0).toBeGreaterThan(0);
  });
});
