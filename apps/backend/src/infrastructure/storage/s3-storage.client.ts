import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import { backendEnv } from '../../env.js';

import type { StorageClient, StorageReadiness } from './storage.client.js';

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
