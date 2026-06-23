import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

import { backendEnv } from '../../env.js';

import type {
  PresignedDownloadParams,
  PresignedUploadParams,
  StorageClient,
  StorageReadiness
} from './storage.client.js';
import type { Readable } from 'node:stream';

@Injectable()
export class S3StorageClient implements StorageClient {
  private client: S3Client | null = null;

  async ping(): Promise<StorageReadiness> {
    let healthy = false;
    try {
      await this.getClient().send(new ListBucketsCommand({}));
      healthy = true;
    } catch {
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

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: backendEnv.S3_ENDPOINT,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: backendEnv.S3_ACCESS_KEY,
          secretAccessKey: backendEnv.S3_SECRET_KEY
        }
      });
    }

    return this.client;
  }
}
