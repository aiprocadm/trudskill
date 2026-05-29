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
}
