import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Загрузка видео методистом (ФТ-B1.1, Фаза 2 Task 2).
 *
 * Видео весит 2–4 ГБ и одним запросом не проходит: файл режется на части, каждая
 * заливается по своей подписанной ссылке, а склеивает их хранилище. Обрыв на середине
 * стоит одной части, а не всей часовой заливки.
 */

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];
export const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024;

export type VideoAssetStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface VideoAssetDto {
  id: string;
  status: VideoAssetStatus;
  sizeBytes: number;
  materialId?: string;
  durationSeconds?: number;
  errorMessage?: string;
}

export interface CreateVideoAssetResult {
  assetId: string;
  status: VideoAssetStatus;
  uploadKind: 'provider' | 'multipart';
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  partSizeBytes?: number;
  partCount?: number;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const videoApi = {
  create: (
    session: UserSession,
    input: { fileName: string; sizeBytes: number; contentType: string }
  ) =>
    apiRequest<CreateVideoAssetResult>('/video-assets', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  partUrl: (session: UserSession, assetId: string, partNumber: number) =>
    apiRequest<{ uploadUrl: string; expiresInSeconds: number }>(
      `/video-assets/${assetId}/part-url`,
      { method: 'POST', body: { partNumber }, auth: auth(session) }
    ),

  complete: (
    session: UserSession,
    assetId: string,
    parts: Array<{ partNumber: number; etag: string }>
  ) =>
    apiRequest<VideoAssetDto>(`/video-assets/${assetId}/complete`, {
      method: 'POST',
      body: { parts },
      auth: auth(session)
    }),

  get: (session: UserSession, assetId: string) =>
    apiRequest<VideoAssetDto>(`/video-assets/${assetId}`, { auth: auth(session) }),

  listByMaterial: (session: UserSession, materialId: string) =>
    apiRequest<{ items: VideoAssetDto[]; total: number }>(
      `/video-assets?materialId=${encodeURIComponent(materialId)}`,
      { auth: auth(session) }
    ),

  attach: (session: UserSession, assetId: string, materialId: string) =>
    apiRequest<VideoAssetDto>(`/video-assets/${assetId}/attach`, {
      method: 'POST',
      body: { materialId },
      auth: auth(session)
    }),

  remove: (session: UserSession, assetId: string) =>
    apiRequest<{ deleted: boolean }>(`/video-assets/${assetId}`, {
      method: 'DELETE',
      auth: auth(session)
    })
};

/**
 * Заливка одной части. ETag берётся из заголовка ответа — по нему хранилище потом
 * собирает файл. Заголовок кросс-доменный, поэтому в CORS хранилища обязан быть
 * `Access-Control-Expose-Headers: ETag`; без него ETag не виден и склейка невозможна.
 */
export async function putVideoPart(uploadUrl: string, chunk: Blob): Promise<string> {
  const res = await fetch(uploadUrl, { method: 'PUT', body: chunk });
  if (!res.ok) throw new Error(`Часть не загрузилась (HTTP ${res.status})`);
  const etag = res.headers.get('ETag') ?? res.headers.get('etag');
  if (!etag) {
    throw new Error(
      'Хранилище не отдало ETag части — проверьте, что в его настройках CORS разрешён заголовок ETag'
    );
  }
  return etag;
}

export interface UploadProgress {
  uploadedParts: number;
  totalParts: number;
}

/**
 * Полный цикл загрузки: создать ассет → залить части → закрыть загрузку.
 * Возвращает идентификатор ассета; статус после этого — «обрабатывается».
 */
export async function uploadVideoFile(
  session: UserSession,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  if (!VIDEO_MIME_TYPES.includes(file.type)) {
    throw new Error('Поддерживаются видеофайлы MP4, MOV, MKV и WebM');
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error('Файл больше 4 ГБ — такой ролик нужно разрезать на части');
  }

  const created = await videoApi.create(session, {
    fileName: file.name,
    sizeBytes: file.size,
    contentType: file.type
  });

  if (created.uploadKind === 'provider') {
    if (!created.uploadUrl) throw new Error('Провайдер не выдал ссылку для загрузки');
    const res = await fetch(created.uploadUrl, {
      method: 'PUT',
      body: file,
      ...(created.uploadHeaders ? { headers: created.uploadHeaders } : {})
    });
    if (!res.ok) throw new Error(`Загрузка к провайдеру не удалась (HTTP ${res.status})`);
    await videoApi.complete(session, created.assetId, []);
    onProgress?.({ uploadedParts: 1, totalParts: 1 });
    return created.assetId;
  }

  const partSize = created.partSizeBytes ?? 0;
  const totalParts = created.partCount ?? 0;
  if (partSize <= 0 || totalParts <= 0) {
    throw new Error('Сервер не сообщил размер части — загрузка невозможна');
  }

  const parts: Array<{ partNumber: number; etag: string }> = [];
  // Последовательно, а не параллельно: у методиста может быть узкий канал, и десяток
  // одновременных потоков сделает загрузку не быстрее, а менее предсказуемой.
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    const start = (partNumber - 1) * partSize;
    const chunk = file.slice(start, Math.min(start + partSize, file.size));
    const { uploadUrl } = await videoApi.partUrl(session, created.assetId, partNumber);
    const etag = await putVideoPart(uploadUrl, chunk);
    parts.push({ partNumber, etag });
    onProgress?.({ uploadedParts: partNumber, totalParts });
  }

  await videoApi.complete(session, created.assetId, parts);
  return created.assetId;
}
