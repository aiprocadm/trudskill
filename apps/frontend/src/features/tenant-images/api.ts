import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Подпись руководителя и печать учебного центра (ФТ-A7.1, Фаза 1 Task 9).
 *
 * Загружаются один раз на весь центр и вставляются в бланк тегом `{%tenant.stamp_image}`.
 * Юридический статус — факсимиле: это картинка на документе, а не электронная подпись.
 */

/** Форматы, которые умеет вставлять движок рендера. */
export const TENANT_IMAGE_MIMES = ['image/png', 'image/jpeg'] as const;

export type TenantImageSlot = 'signature' | 'stamp';

export interface TenantImageDto {
  fileId: string;
  /** Ширина на бланке в миллиметрах; высота считается по пропорциям картинки. */
  widthMm?: number;
}

export type TenantImagesDto = Partial<Record<TenantImageSlot, TenantImageDto>>;

export interface TenantImageUploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const tenantImagesApi = {
  list: (session: UserSession) =>
    apiRequest<{ images: TenantImagesDto }>('/tenant-images', { auth: auth(session) }),

  uploadUrl: (
    session: UserSession,
    input: { originalName: string; sizeBytes: number; contentType: string }
  ) =>
    apiRequest<TenantImageUploadIntent>('/tenant-images/upload-url', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  save: (
    session: UserSession,
    slot: TenantImageSlot,
    input: { fileId: string | null; widthMm?: number }
  ) =>
    apiRequest<{ images: TenantImagesDto }>(`/tenant-images/${slot}`, {
      method: 'PUT',
      body: input,
      auth: auth(session)
    })
};

/**
 * Прямой PUT в presigned-URL мимо конверта API. `Content-Type` обязан совпасть с тем,
 * чем подписан интент, — иначе хранилище ответит 403 (та же грабля, что у бланков).
 */
export async function putTenantImage(
  uploadUrl: string,
  file: File,
  contentType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file
  });
  if (!res.ok) throw new Error(`Не удалось загрузить картинку в хранилище (HTTP ${res.status})`);
}
