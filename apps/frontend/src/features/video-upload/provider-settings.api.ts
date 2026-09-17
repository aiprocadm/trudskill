import { apiRequest } from '../../lib/api/client';
import { providerLabels } from '../texts/providers.ru';

/**
 * Настройка видеопоставщика центра (ФТ-B1.1, право `video.configure`).
 *
 * Отдельный модуль рядом с загрузкой видео: у `api.ts` своя договорённость — он получает
 * сессию параметром, а секции экрана настроек (оплата, вебинары) ходят без неё. Смешивать
 * две договорённости в одном файле — верный способ забыть, какая тут действует.
 */
export const VIDEO_PROVIDER_CODES = ['noop', 'fake', 'selfhosted', 'kinescope', 'vk'] as const;
export type VideoProviderCode = (typeof VIDEO_PROVIDER_CODES)[number];

/** Русские подписи — из общего словаря поставщиков (ТЗ 4.2): одно имя на код во всех списках. */
export const VIDEO_PROVIDER_LABELS: Record<VideoProviderCode, string> =
  providerLabels(VIDEO_PROVIDER_CODES);

export interface VideoProviderSettings {
  tenantId: string;
  providerCode: VideoProviderCode;
  baseUrl?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface VideoProviderSettingsInput {
  providerCode: VideoProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export const getVideoProviderSettings = (): Promise<VideoProviderSettings> =>
  apiRequest<VideoProviderSettings>('/video/provider-settings');

export const saveVideoProviderSettings = (
  input: VideoProviderSettingsInput
): Promise<VideoProviderSettings> =>
  apiRequest<VideoProviderSettings>('/video/provider-settings', { method: 'PUT', body: input });
