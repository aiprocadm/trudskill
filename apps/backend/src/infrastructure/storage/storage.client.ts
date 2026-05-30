import type { Readable } from 'node:stream';

export interface StorageReadiness {
  provider: 's3-compatible';
  healthy: boolean;
}

export interface PresignedUploadParams {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface PresignedDownloadParams {
  key: string;
  expiresInSeconds?: number;
}

export interface StorageClient {
  ping(): Promise<StorageReadiness>;
  createPresignedUploadUrl(params: PresignedUploadParams): Promise<string>;
  createPresignedDownloadUrl(params: PresignedDownloadParams): Promise<string>;
  /** Streams the raw bytes of a stored object. Used by the antivirus scanner. */
  getObjectStream(params: { key: string }): Promise<Readable>;
}
