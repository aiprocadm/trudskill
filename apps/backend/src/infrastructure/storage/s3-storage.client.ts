import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

import { backendEnv } from '../../env.js';

import type {
  MultipartPart,
  MultipartUploadRef,
  PresignedDownloadParams,
  PresignedUploadParams,
  StorageClient,
  StorageReadiness
} from './storage.client.js';
import type { Readable } from 'node:stream';

/**
 * Сроки для S3 (журнал 335). По умолчанию клиент AWS не ограничивает ни подключение, ни
 * ожидание ответа: молчащее хранилище держало загрузку файла, пока TCP сам не сдастся.
 * `socketTimeout` — тишина на сокете, а не вся передача: большой файл, который идёт, не срывается.
 */
const S3_CONNECTION_TIMEOUT_MS = 5_000;
const S3_SOCKET_TIMEOUT_MS = 60_000;

@Injectable()
export class S3StorageClient implements StorageClient {
  private client: S3Client | null = null;

  async ping(): Promise<StorageReadiness> {
    let healthy = false;
    try {
      await this.getClient().send(new ListBucketsCommand({}));
      healthy = true;
    } catch {
      // Недоступность и ЕСТЬ ответ: проверка живости для того и вызывается.
      healthy = false;
    }

    return {
      provider: 's3-compatible',
      healthy
    };
  }

  async createPresignedUploadUrl(params: PresignedUploadParams): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: backendEnv.S3_BUCKET,
      Key: params.key,
      ContentType: params.contentType,
      // Sign Content-Length into the URL so S3 enforces the declared size (server-side); the
      // browser sets content-length from the body, so a larger body fails the signature.
      ...(params.contentLength !== undefined ? { ContentLength: params.contentLength } : {})
    });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: params.expiresInSeconds ?? 900
    });
  }

  async createPresignedDownloadUrl(params: PresignedDownloadParams): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: backendEnv.S3_BUCKET,
      Key: params.key
    });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: params.expiresInSeconds ?? 900
    });
  }

  async getObjectStream(params: { key: string }): Promise<Readable> {
    const response = await this.getClient().send(
      new GetObjectCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key
      })
    );
    if (!response.Body) {
      throw new Error(`Object has no body: ${params.key}`);
    }
    // In Node, GetObject Body is a Readable stream.
    return response.Body as Readable;
  }

  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType
      })
    );
  }

  async deleteObject(params: { key: string }): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key
      })
    );
  }

  /** All keys under a prefix (paginated ListObjectsV2). Phase 9: SCORM prefix cleanup. */
  async listObjectKeys(params: { prefix: string }): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.getClient().send(
        new ListObjectsV2Command({
          Bucket: backendEnv.S3_BUCKET,
          Prefix: params.prefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {})
        })
      );
      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }

  /**
   * Загрузка по частям (ФТ-B1.1). Видео 2–4 ГБ одним PUT не проходит, а обрыв на середине
   * часовой заливки означал бы «начни сначала»; здесь заново шлётся только упавшая часть.
   */
  async createMultipartUpload(params: {
    key: string;
    contentType: string;
  }): Promise<MultipartUploadRef> {
    const response = await this.getClient().send(
      new CreateMultipartUploadCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key,
        ContentType: params.contentType
      })
    );
    if (!response.UploadId) {
      throw new Error('S3 did not return an UploadId for the multipart upload');
    }
    return { key: params.key, uploadId: response.UploadId };
  }

  async createPresignedPartUrl(params: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: backendEnv.S3_BUCKET,
      Key: params.key,
      UploadId: params.uploadId,
      PartNumber: params.partNumber
    });
    return getSignedUrl(this.getClient(), command, {
      expiresIn: params.expiresInSeconds ?? 900
    });
  }

  async completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void> {
    await this.getClient().send(
      new CompleteMultipartUploadCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: {
          // S3 требует строго возрастающий порядок номеров — клиент может прислать вразнобой.
          Parts: [...params.parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag }))
        }
      })
    );
  }

  async abortMultipartUpload(params: { key: string; uploadId: string }): Promise<void> {
    await this.getClient().send(
      new AbortMultipartUploadCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key,
        UploadId: params.uploadId
      })
    );
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: backendEnv.S3_ENDPOINT,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: backendEnv.S3_ACCESS_KEY,
          secretAccessKey: backendEnv.S3_SECRET_KEY
        },
        requestHandler: {
          connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
          socketTimeout: S3_SOCKET_TIMEOUT_MS
        }
      });
    }

    return this.client;
  }
}
