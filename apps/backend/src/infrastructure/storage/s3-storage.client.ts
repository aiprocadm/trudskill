import { Injectable } from '@nestjs/common';
import { backendEnv } from '../../env.js';
import { checkTcpEndpoint } from '../health/tcp-check.util.js';
import type { StorageClient, StorageReadiness } from './storage.client.js';

@Injectable()
export class S3StorageClient implements StorageClient {
  async ping(): Promise<StorageReadiness> {
    const healthy = await checkTcpEndpoint(backendEnv.S3_ENDPOINT);
    return {
      provider: 's3-compatible',
      healthy
    };
  }
}
