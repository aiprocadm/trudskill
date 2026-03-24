import { Injectable } from '@nestjs/common';
import type { StorageClient, StorageReadiness } from './storage.client.js';

@Injectable()
export class S3StorageClient implements StorageClient {
  async ping(): Promise<StorageReadiness> {
    return {
      provider: 's3-compatible',
      healthy: true
    };
  }
}
