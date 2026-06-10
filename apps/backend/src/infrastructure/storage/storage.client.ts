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
  /** Writes a Buffer directly to object storage. Used for server-generated files (e.g. XLSX exports). */
  putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>;
  /** Permanently deletes an object from storage. Used by the identity image retention cron. */
  deleteObject(params: { key: string }): Promise<void>;
}
