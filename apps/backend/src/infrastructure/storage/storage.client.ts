import type { Readable } from 'node:stream';

export interface StorageReadiness {
  provider: 's3-compatible';
  healthy: boolean;
}

export interface PresignedUploadParams {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
  /**
   * Exact byte size the client declared. When set it is signed into the presigned PUT as
   * Content-Length, so S3 rejects any body whose length differs — server-side enforcement of the
   * declared size, closing the "claim 1 KB, upload 500 MB" gap left by the advisory check.
   */
  contentLength?: number;
}

export interface PresignedDownloadParams {
  key: string;
  expiresInSeconds?: number;
}

/**
 * Загрузка по частям (ФТ-B1.1, Фаза 2 Task 2). Видео весит 2–4 ГБ и одним PUT не проходит:
 * рвётся соединение — и часовая заливка начинается заново. S3 режет файл на части,
 * каждая подписывается отдельно, а сборка происходит на стороне хранилища.
 */
export interface MultipartUploadRef {
  key: string;
  uploadId: string;
}

export interface MultipartPart {
  partNumber: number;
  /** ETag части, который вернул S3 в заголовке ответа на PUT. */
  etag: string;
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
  /** Lists all object keys under a prefix (paginated). Phase 9: SCORM prefix cleanup. */
  listObjectKeys(params: { prefix: string }): Promise<string[]>;
  /** Открывает загрузку по частям и возвращает её идентификатор (ФТ-B1.1). */
  createMultipartUpload(params: { key: string; contentType: string }): Promise<MultipartUploadRef>;
  /** Подписанный PUT для одной части; номера частей начинаются с 1. */
  createPresignedPartUrl(params: {
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<string>;
  /** Склеивает залитые части в объект. Части обязаны идти по возрастанию номера. */
  completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void>;
  /** Отменяет незавершённую загрузку — иначе части остаются в хранилище и занимают место. */
  abortMultipartUpload(params: { key: string; uploadId: string }): Promise<void>;
}
