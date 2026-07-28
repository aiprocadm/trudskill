import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  VIDEO_ASSETS_REPOSITORY,
  type VideoAssetRow,
  type VideoAssetsRepository
} from './video-assets.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { FilesService } from '../../files/files.service.js';

import type { MultipartPart } from '../../../infrastructure/storage/storage.client.js';

/**
 * Загрузка видео методистом (ФТ-B1.1, Фаза 2 Task 2).
 *
 * Две ветки за одним API:
 *   * у тенанта настроен провайдер — файл летит прямо к нему (`createUploadTarget`);
 *   * иначе self-hosted — загрузка по частям в наш S3, потому что 2–4 ГБ одним PUT
 *     не проходят, а обрыв на середине часовой заливки означал бы «начни сначала».
 *
 * Какая ветка сработала, видно по `uploadKind` в ответе — интерфейсу нужно знать,
 * слать ли части или один файл.
 */

/** ТЗ B1.1: до 2–4 ГБ. Берём верхнюю границу. */
export const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024;

export const VIDEO_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm'
]);

export interface CreateVideoAssetResult {
  assetId: string;
  status: VideoAssetRow['status'];
  uploadKind: 'provider' | 'multipart';
  /** Ветка провайдера: куда лить файл целиком. */
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  /** Ветка self-hosted: параметры загрузки по частям. */
  partSizeBytes?: number;
  partCount?: number;
}

@Injectable()
export class VideoService {
  constructor(
    @Inject(VIDEO_ASSETS_REPOSITORY) private readonly assets: VideoAssetsRepository,
    @Inject(VideoProviderResolver) private readonly providers: VideoProviderResolver,
    @Inject(FilesService) private readonly files: FilesService
  ) {}

  async createAsset(
    tenantId: string,
    input: { fileName: string; sizeBytes: number; contentType: string }
  ): Promise<CreateVideoAssetResult> {
    if (!VIDEO_MIME_ALLOWLIST.has(input.contentType)) {
      throw new BadRequestException({
        code: 'unsupported_media_type',
        message: 'Поддерживаются видеофайлы MP4, MOV, MKV и WebM'
      });
    }
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'sizeBytes must be a positive integer'
      });
    }
    if (input.sizeBytes > VIDEO_MAX_BYTES) {
      throw new BadRequestException({
        code: 'file_too_large',
        message: 'Файл больше 4 ГБ — такой ролик нужно разрезать на части'
      });
    }

    const assetId = `vasset_${randomUUID()}`;
    const provider = await this.providers.forTenant(tenantId);
    const target = await provider.createUploadTarget({
      tenantId,
      assetId,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      contentType: input.contentType
    });

    if (target) {
      const asset = await this.assets.create({
        id: assetId,
        tenantId,
        providerCode: provider.code,
        status: 'uploading',
        sizeBytes: input.sizeBytes,
        ...(target.providerAssetId ? { providerAssetId: target.providerAssetId } : {})
      });
      return {
        assetId: asset.id,
        status: asset.status,
        uploadKind: 'provider',
        uploadUrl: target.uploadUrl,
        ...(target.headers ? { uploadHeaders: target.headers } : {})
      };
    }

    // Провайдер спит или не настроен → льём к себе. Файл регистрируется в storage.files,
    // поэтому антивирусный гейт (ФТ-G5) достаётся даром.
    const intent = await this.files.createMultipartUploadIntent(
      tenantId,
      {
        originalName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes
      },
      {
        keyPrefix: 'video',
        mimeAllowlist: VIDEO_MIME_ALLOWLIST,
        maxBytes: VIDEO_MAX_BYTES
      }
    );
    const asset = await this.assets.create({
      id: assetId,
      tenantId,
      providerCode: provider.code,
      status: 'uploading',
      sizeBytes: input.sizeBytes,
      storageKey: intent.storageKey,
      fileId: intent.fileId,
      multipartUploadId: intent.uploadId
    });
    return {
      assetId: asset.id,
      status: asset.status,
      uploadKind: 'multipart',
      partSizeBytes: intent.partSizeBytes,
      partCount: intent.partCount
    };
  }

  /** Подписанный PUT для одной части. Номера — от 1 включительно. */
  async createPartUrl(
    tenantId: string,
    assetId: string,
    partNumber: number
  ): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
    const asset = await this.requireAsset(tenantId, assetId);
    const upload = this.requireMultipart(asset);
    if (asset.status !== 'uploading') {
      throw new BadRequestException({
        code: 'invalid_state',
        message: `Загрузка уже завершена (статус «${asset.status}»)`
      });
    }
    return this.files.createPartUploadUrl({
      storageKey: upload.storageKey,
      uploadId: upload.uploadId,
      partNumber
    });
  }

  /**
   * Завершение загрузки: части склеиваются в объект, ассет уходит в `processing`.
   * В `ready` его переводит Task 10 — транскодер или вебхук провайдера.
   */
  async completeUpload(
    tenantId: string,
    assetId: string,
    parts: MultipartPart[]
  ): Promise<VideoAssetRow> {
    const asset = await this.requireAsset(tenantId, assetId);
    if (asset.status !== 'uploading') {
      // Повтор запроса при обрыве ответа не должен ломать уже завершённую загрузку.
      return asset;
    }
    if (asset.providerCode !== 'noop' && !asset.multipartUploadId) {
      // Провайдерская ветка: склеивать нечего, обработку подтвердит вебхук.
      return (await this.assets.update(tenantId, assetId, { status: 'processing' })) ?? asset;
    }
    const upload = this.requireMultipart(asset);
    await this.files.completeMultipartUpload({
      storageKey: upload.storageKey,
      uploadId: upload.uploadId,
      parts
    });
    // multipartUploadId стирается: загрузка закрыта, отменять больше нечего.
    return (
      (await this.assets.update(tenantId, assetId, {
        status: 'processing',
        multipartUploadId: null
      })) ?? asset
    );
  }

  async getAsset(tenantId: string, assetId: string): Promise<VideoAssetRow> {
    return this.requireAsset(tenantId, assetId);
  }

  async listByMaterial(tenantId: string, materialId: string): Promise<VideoAssetRow[]> {
    return this.assets.listByMaterial(tenantId, materialId);
  }

  /**
   * Привязка ассета к уроку. Битое видео привязать нельзя: урок с материалом
   * `failed` показал бы слушателю пустой плеер вместо занятия.
   */
  async attachToMaterial(
    tenantId: string,
    assetId: string,
    materialId: string
  ): Promise<VideoAssetRow> {
    const asset = await this.requireAsset(tenantId, assetId);
    if (asset.status === 'failed') {
      throw new BadRequestException({
        code: 'invalid_state',
        message: 'Нельзя привязать к уроку видео, обработка которого не удалась'
      });
    }
    return (await this.assets.update(tenantId, assetId, { materialId })) ?? asset;
  }

  /** Удаление: незавершённая загрузка отменяется, иначе части останутся занимать место. */
  async deleteAsset(tenantId: string, assetId: string): Promise<void> {
    const asset = await this.requireAsset(tenantId, assetId);
    if (asset.storageKey && asset.multipartUploadId) {
      await this.files
        .abortMultipartUpload({
          storageKey: asset.storageKey,
          uploadId: asset.multipartUploadId
        })
        // Хранилище могло само вычистить брошенную загрузку — это не повод не дать удалить ассет.
        .catch(() => undefined);
    }
    await this.assets.delete(tenantId, assetId);
  }

  /** Пометить ассет упавшим с человекочитаемой причиной (ФТ-A1.5-подход: текст, а не код). */
  async markFailed(tenantId: string, assetId: string, message: string): Promise<VideoAssetRow> {
    const asset = await this.requireAsset(tenantId, assetId);
    return (
      (await this.assets.update(tenantId, assetId, {
        status: 'failed',
        errorMessage: message.slice(0, 900)
      })) ?? asset
    );
  }

  private async requireAsset(tenantId: string, assetId: string): Promise<VideoAssetRow> {
    const asset = await this.assets.findById(tenantId, assetId);
    if (!asset) {
      // 404, а не 403: чужой ассет не должен даже подтверждать своё существование.
      throw new NotFoundException({ code: 'not_found', message: 'Video asset not found' });
    }
    return asset;
  }

  private requireMultipart(asset: VideoAssetRow): { storageKey: string; uploadId: string } {
    if (!asset.storageKey || !asset.multipartUploadId) {
      throw new BadRequestException({
        code: 'invalid_state',
        message: 'У этого видео нет незавершённой загрузки по частям'
      });
    }
    return { storageKey: asset.storageKey, uploadId: asset.multipartUploadId };
  }
}
