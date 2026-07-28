import type { VideoAsset, VideoAssetStatus } from '../mvp.types.js';

export const VIDEO_ASSETS_REPOSITORY = Symbol('VIDEO_ASSETS_REPOSITORY');

/** Поля, которых нет в доменном типе: они про механику загрузки, а не про само видео. */
export interface VideoAssetRow extends VideoAsset {
  /** Запись в `storage.files` — через неё работает AV-гейт (ФТ-G5). */
  fileId?: string;
  /** S3 UploadId незавершённой загрузки по частям. */
  multipartUploadId?: string;
}

export interface CreateVideoAssetInput {
  id: string;
  tenantId: string;
  providerCode: string;
  status: VideoAssetStatus;
  sizeBytes: number;
  providerAssetId?: string;
  storageKey?: string;
  fileId?: string;
  multipartUploadId?: string;
}

export interface UpdateVideoAssetInput {
  status?: VideoAssetStatus;
  durationSeconds?: number;
  errorMessage?: string | null;
  materialId?: string | null;
  multipartUploadId?: string | null;
}

export interface VideoAssetsRepository {
  create(input: CreateVideoAssetInput): Promise<VideoAssetRow>;
  /** Всегда в рамках тенанта: чужой ассет не должен находиться даже по точному id. */
  findById(tenantId: string, id: string): Promise<VideoAssetRow | null>;
  listByMaterial(tenantId: string, materialId: string): Promise<VideoAssetRow[]>;
  update(tenantId: string, id: string, patch: UpdateVideoAssetInput): Promise<VideoAssetRow | null>;
  delete(tenantId: string, id: string): Promise<boolean>;
}
