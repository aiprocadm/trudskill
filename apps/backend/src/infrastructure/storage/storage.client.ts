export interface StorageReadiness {
  provider: 's3-compatible';
  healthy: boolean;
}

export interface StorageClient {
  ping(): Promise<StorageReadiness>;
}
